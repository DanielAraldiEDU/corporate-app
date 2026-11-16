/**
 * SessionManager — owns the authentication lifecycle and MDM policy enforcement.
 *
 * - Access token: memory only (private field), never persisted.
 * - Refresh token: persisted only through the secure credential store (Keychain/Keystore);
 *   held in memory while the session is unlocked so silent refreshes don't re-prompt.
 * - Policy: fetched from the mock MDM backend on sign-in, refresh, and every check-in;
 *   revocation or a disallowed device ends the session and wipes stored credentials.
 *
 * Framework-free (no React) so it can be unit tested with injected fakes.
 */
import type { AuthDelegate, ApiClient } from '@/services/api/client';
import { ApiError, isApiError } from '@/services/api/errors';
import type { FieldOpsApi } from '@/services/api/fieldops-api';
import { evaluateCompliance, type ComplianceResult } from '@/services/device/compliance';
import type { getDeviceReport as GetDeviceReport } from '@/services/device/device-info';
import {
  biometryUnavailableReason,
  UNKNOWN_BIOMETRY,
  type BiometryCapability,
} from '@/services/secure-store/biometrics';
import {
  SecureStoreError,
  type AuthenticationPrompt,
  type SecureCredentialStore,
  type StoredSessionMeta,
} from '@/services/secure-store/secure-credential-store';
import type { CheckInReason, Device, DevicePolicy, LoginResponse, RefreshResponse, User } from '@/types/api';

export type SessionStatus = 'restoring' | 'signedOut' | 'locked' | 'authenticated';

export type SessionNotice = { tone: 'danger' | 'warning' | 'info'; title: string; message: string };

export type SessionState = {
  status: SessionStatus;
  user: User | null;
  device: Device | null;
  policy: DevicePolicy | null;
  biometry: BiometryCapability;
  /** How the current refresh token is stored. */
  credential: { biometricProtected: boolean; storage: string } | null;
  /** Shown on the lock screen when a stored session exists but is not unlocked. */
  lockedProfile: { name: string; email: string; biometricProtected: boolean } | null;
  connectivity: 'online' | 'offline';
  lastSyncAt: number | null;
  syncing: boolean;
  unlocking: boolean;
  /** Explanation shown on the sign-in screen (revocation, expiry, policy changes). */
  notice: SessionNotice | null;
};

export class SessionError extends Error {
  constructor(
    readonly code: 'BIOMETRICS_REQUIRED' | 'STORAGE',
    message: string,
  ) {
    super(message);
    this.name = 'SessionError';
  }
}

export type SessionDeps = {
  client: ApiClient;
  api: FieldOpsApi;
  store: SecureCredentialStore;
  getBiometry: () => Promise<BiometryCapability>;
  getDeviceReport: typeof GetDeviceReport;
  now?: () => number;
  policyMaxAgeMs?: number;
};

/** Refresh a little early so requests don't race the server-side expiry. */
const EXPIRY_SKEW_MS = 10_000;

const INITIAL_STATE: SessionState = {
  status: 'restoring',
  user: null,
  device: null,
  policy: null,
  biometry: UNKNOWN_BIOMETRY,
  credential: null,
  lockedProfile: null,
  connectivity: 'online',
  lastSyncAt: null,
  syncing: false,
  unlocking: false,
  notice: null,
};

export function complianceFor(state: SessionState): ComplianceResult {
  return evaluateCompliance({
    device: state.device,
    policy: state.policy,
    credentialBiometricProtected: state.credential?.biometricProtected ?? false,
    connectivity: state.connectivity,
  });
}

export class SessionManager implements AuthDelegate {
  private state: SessionState = INITIAL_STATE;
  private listeners = new Set<() => void>();

  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;
  private refreshToken: string | null = null;
  private refreshInFlight: Promise<string | null> | null = null;
  private syncInFlight: Promise<void> | null = null;
  /** Incremented whenever a session starts or ends; stale async results are discarded. */
  private epoch = 0;

  private readonly now: () => number;
  private readonly policyMaxAgeMs: number;

  constructor(private readonly deps: SessionDeps) {
    this.now = deps.now ?? Date.now;
    this.policyMaxAgeMs = deps.policyMaxAgeMs ?? 15_000;
    deps.client.setAuthDelegate(this);
  }

  get api(): FieldOpsApi {
    return this.deps.api;
  }

  // ------------------------------------------------------------------ store plumbing
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (): SessionState => this.state;

  private setState(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  // ------------------------------------------------------------------ AuthDelegate
  getAccessToken = (): string | null => {
    if (!this.accessToken || this.now() >= this.accessTokenExpiresAt - EXPIRY_SKEW_MS) return null;
    return this.accessToken;
  };

  refreshAccessToken = (): Promise<string | null> => {
    if (!this.refreshToken) return Promise.resolve(null);
    this.refreshInFlight ??= this.performRefresh().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  };

  onAccessDenied = (error: ApiError) => {
    void this.handleAccessDenied(error);
  };

  // ------------------------------------------------------------------ lifecycle
  /** Session restoration on app start. */
  restore = async () => {
    const [biometry, meta] = await Promise.all([
      this.deps.getBiometry().catch(() => UNKNOWN_BIOMETRY),
      this.deps.store.readSessionMeta(),
    ]);
    if (!meta) {
      this.setState({ status: 'signedOut', biometry });
      return;
    }
    this.setState({
      status: 'locked',
      biometry,
      lockedProfile: { name: meta.name, email: meta.email, biometricProtected: meta.biometricProtected },
    });
    // Non-biometric sessions restore silently; biometric ones wait for the user (see unlock()).
    if (!meta.biometricProtected) await this.unlock();
  };

  /** Reads the stored refresh token (biometric prompt if bound) and resumes the session. */
  unlock = async () => {
    const meta = await this.deps.store.readSessionMeta();
    if (!meta) {
      this.setState({ status: 'signedOut', lockedProfile: null });
      return;
    }
    this.setState({ unlocking: true, notice: null });

    let refreshToken: string | null;
    try {
      refreshToken = await this.deps.store.readRefreshToken(this.prompt(meta));
    } catch (error) {
      await this.handleUnlockError(error);
      return;
    }
    if (!refreshToken) {
      await this.endSession(null);
      return;
    }

    const epoch = ++this.epoch;
    let response: RefreshResponse;
    try {
      response = await this.deps.api.auth.refresh(refreshToken);
    } catch (error) {
      if (epoch !== this.epoch) return;
      if (isApiError(error) && error.isAccessDenied) return; // handled by onAccessDenied
      if (isApiError(error) && error.isNetworkError) {
        this.setState({
          unlocking: false,
          notice: { tone: 'warning', title: 'Can’t reach FieldOps', message: `${error.message} Your saved session is kept.` },
        });
        return;
      }
      if (isApiError(error) && error.status === 401) {
        await this.endSession({ tone: 'info', title: 'Session expired', message: 'Sign in again to continue.' });
        return;
      }
      this.setState({
        unlocking: false,
        notice: { tone: 'warning', title: 'Unlock failed', message: 'FieldOps could not resume your session. Try again.' },
      });
      return;
    }
    if (epoch !== this.epoch) return;

    this.refreshToken = refreshToken;
    this.startSession(response, { biometricProtected: meta.biometricProtected, storage: meta.storage });
    if (await this.enforcePolicy()) void this.sync('login').catch(() => undefined);
  };

  /** Password sign-in. Throws ApiError / SessionError for the form to display. */
  signIn = async (email: string, password: string) => {
    this.setState({ notice: null });
    const biometry = await this.deps.getBiometry().catch(() => UNKNOWN_BIOMETRY);
    this.setState({ biometry });

    let response: LoginResponse;
    try {
      response = await this.deps.api.auth.login(email, password, this.deps.getDeviceReport());
    } catch (error) {
      if (isApiError(error) && error.isAccessDenied) return; // notice set by onAccessDenied
      throw error;
    }

    const requireBiometrics = response.policy.requireBiometrics;
    const abandon = () => this.deps.api.auth.logout(response.refreshToken).catch(() => undefined);

    if (requireBiometrics && !biometry.available) {
      await abandon();
      throw new SessionError(
        'BIOMETRICS_REQUIRED',
        `Your organization requires biometric authentication on this device. ${biometryUnavailableReason(biometry)}`,
      );
    }

    let saved;
    try {
      saved = await this.deps.store.saveSession(
        response.refreshToken,
        { userId: response.user.id, deviceId: response.device.id, email: response.user.email, name: response.user.name },
        { requireBiometrics, prompt: this.prompt({ email: response.user.email }) },
      );
    } catch (error) {
      await abandon();
      const reason = error instanceof Error ? error.message : 'Secure storage failed.';
      if (requireBiometrics) {
        throw new SessionError('BIOMETRICS_REQUIRED', `${reason} Biometric verification is required by your organization’s policy.`);
      }
      throw new SessionError('STORAGE', reason);
    }

    ++this.epoch;
    this.refreshToken = response.refreshToken;
    this.startSession(response, saved);
    void this.sync('login').catch(() => undefined);
  };

  /** Secure logout: invalidates the server session and wipes Keychain/Keystore entries. */
  signOut = async (notice: SessionNotice | null = null) => {
    await this.endSession(notice, { serverLogout: true });
  };

  /** Device check-in: reports status, re-reads policy, and enforces it. */
  sync = (reason: CheckInReason): Promise<void> => {
    if (this.state.status !== 'authenticated' || !this.state.device) return Promise.resolve();
    if (this.syncInFlight) {
      // Background check-ins coalesce. User- and resource-initiated syncs must observe the
      // server state *after* they were requested, so they queue behind the running one.
      if (reason === 'periodic' || reason === 'foreground' || reason === 'login') return this.syncInFlight;
      return this.syncInFlight.catch(() => undefined).then(() => this.sync(reason));
    }
    this.syncInFlight = this.performSync(reason).finally(() => {
      this.syncInFlight = null;
    });
    return this.syncInFlight;
  };

  /** Re-reads device record and policy without reporting a check-in. */
  refreshPolicy = async () => {
    const { status, device } = this.state;
    if (status !== 'authenticated' || !device) return;
    const epoch = this.epoch;
    try {
      const latest = await this.deps.api.devices.get(device.id);
      const policy = await this.deps.api.policies.get(latest.policyId);
      if (epoch !== this.epoch) return;
      this.setState({ device: latest, policy, connectivity: 'online', lastSyncAt: this.now() });
      await this.enforcePolicy();
    } catch (error) {
      if (epoch !== this.epoch) return;
      if (isApiError(error) && error.isNetworkError) this.setState({ connectivity: 'offline' });
      throw error;
    }
  };

  /** Called before showing protected resources. Re-verifies stale policy state. */
  ensureAccess = async (): Promise<boolean> => {
    if (this.state.status !== 'authenticated') return false;
    const { lastSyncAt } = this.state;
    if (!lastSyncAt || this.now() - lastSyncAt > this.policyMaxAgeMs) {
      await this.sync('resource').catch(() => undefined);
    }
    return this.state.status === 'authenticated' && complianceFor(this.state).allowed;
  };

  refreshBiometry = async () => {
    const biometry = await this.deps.getBiometry().catch(() => UNKNOWN_BIOMETRY);
    this.setState({ biometry });
  };

  dismissNotice = () => this.setState({ notice: null });

  // ------------------------------------------------------------------ internals
  private prompt(meta: Pick<StoredSessionMeta, 'email'>): AuthenticationPrompt {
    return `Unlock FieldOps for ${meta.email}`;
  }

  private setTokens(accessToken: string, expiresInSeconds: number) {
    this.accessToken = accessToken;
    this.accessTokenExpiresAt = this.now() + expiresInSeconds * 1000;
  }

  private startSession(
    response: RefreshResponse,
    credential: { biometricProtected: boolean; storage: string },
  ) {
    this.setTokens(response.accessToken, response.accessTokenExpiresIn);
    this.setState({
      status: 'authenticated',
      user: response.user,
      device: response.device,
      policy: response.policy,
      credential,
      lockedProfile: null,
      connectivity: 'online',
      lastSyncAt: this.now(),
      unlocking: false,
      notice: null,
    });
  }

  private async performRefresh(): Promise<string | null> {
    const refreshToken = this.refreshToken;
    if (!refreshToken) return null;
    const epoch = this.epoch;
    try {
      const response = await this.deps.api.auth.refresh(refreshToken);
      if (epoch !== this.epoch) return null;
      this.setTokens(response.accessToken, response.accessTokenExpiresIn);
      this.setState({ user: response.user, device: response.device, policy: response.policy, connectivity: 'online' });
      return (await this.enforcePolicy()) ? this.accessToken : null;
    } catch (error) {
      if (epoch !== this.epoch) return null;
      if (isApiError(error) && error.isAccessDenied) return null; // session already ended
      if (isApiError(error) && error.isNetworkError) this.setState({ connectivity: 'offline' });
      if (!isApiError(error) || error.status !== 401) throw error;
      await this.endSession({ tone: 'info', title: 'Session expired', message: 'Sign in again to continue.' });
      return null;
    }
  }

  private async performSync(reason: CheckInReason) {
    const { device, credential } = this.state;
    if (!device) return;
    const epoch = this.epoch;
    this.setState({ syncing: true });
    try {
      if (reason === 'manual' || reason === 'foreground') await this.refreshBiometry();
      const report = this.deps.getDeviceReport({
        biometricsEnrolled: this.state.biometry.available,
        secureStorage: credential?.storage,
      });
      const updated = await this.deps.api.devices.checkIn(device.id, report, reason);
      const policy = await this.deps.api.policies.get(updated.policyId);
      if (epoch !== this.epoch) return;
      this.setState({ device: updated, policy, connectivity: 'online', lastSyncAt: this.now(), syncing: false });
      await this.enforcePolicy();
    } catch (error) {
      if (epoch !== this.epoch) return;
      this.setState({
        syncing: false,
        ...(isApiError(error) && error.isNetworkError ? { connectivity: 'offline' as const } : {}),
      });
      throw error;
    }
  }

  /** Applies the latest device/policy. Returns false if the session was ended. */
  private async enforcePolicy(): Promise<boolean> {
    const { device, policy, credential, biometry } = this.state;
    if (!device || !policy) return true;
    if (device.accessRevoked) {
      await this.handleAccessDenied(
        new ApiError(403, 'DEVICE_REVOKED', 'Your administrator revoked FieldOps access for this device.'),
      );
      return false;
    }
    if (!policy.deviceAllowed) {
      await this.handleAccessDenied(
        new ApiError(403, 'DEVICE_NOT_ALLOWED', 'This device does not meet the security policy required to access corporate resources.'),
      );
      return false;
    }
    if (policy.requireBiometrics && !credential?.biometricProtected) {
      await this.endSession(
        {
          tone: 'warning',
          title: 'Biometric sign-in required',
          message: `Security policy v${policy.policyVersion} now requires ${biometry.available ? biometry.label : 'biometric authentication'}. Sign in with your password to protect your credentials.`,
        },
        { serverLogout: true },
      );
      return false;
    }
    return true;
  }

  private async handleAccessDenied(error: ApiError) {
    const title =
      error.code === 'DEVICE_REVOKED'
        ? 'Access revoked'
        : error.code === 'DEVICE_NOT_ENROLLED'
          ? 'Device not enrolled'
          : 'Device not compliant';
    // The server already invalidated the session; only local credentials need removal.
    await this.endSession({ tone: 'danger', title, message: error.message });
  }

  private async handleUnlockError(error: unknown) {
    const kind = error instanceof SecureStoreError ? error.kind : 'unknown';
    const message = error instanceof Error ? error.message : 'Unlock failed.';
    if (kind === 'canceled') {
      this.setState({
        unlocking: false,
        notice: { tone: 'info', title: 'Unlock canceled', message: 'Try again, or sign in with your password.' },
      });
      return;
    }
    if (kind === 'lockout') {
      this.setState({ unlocking: false, notice: { tone: 'warning', title: 'Biometrics locked', message } });
      return;
    }
    // Item invalidated (biometric set changed), biometrics removed, or storage failure:
    // the stored credential is unusable, so remove it and fall back to password sign-in.
    await this.endSession({
      tone: 'warning',
      title: 'Biometric unlock unavailable',
      message: `${message} Sign in with your password.`,
    });
  }

  /** Ends the session immediately in memory, then wipes secure storage. */
  private async endSession(notice: SessionNotice | null, { serverLogout = false } = {}) {
    const refreshToken = this.refreshToken;
    this.epoch++;
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
    this.refreshToken = null;
    this.setState({
      status: 'signedOut',
      user: null,
      device: null,
      policy: null,
      credential: null,
      lockedProfile: null,
      connectivity: 'online',
      lastSyncAt: null,
      syncing: false,
      unlocking: false,
      notice,
    });
    await this.deps.store.clearSession();
    if (serverLogout && refreshToken) {
      await this.deps.api.auth.logout(refreshToken).catch(() => undefined);
    }
  }
}
