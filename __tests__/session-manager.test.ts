import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { ApiError } from '@/services/api/errors';
import { complianceFor, SessionError } from '@/services/auth/session-manager';
import { createFakeBackend, createTestManager, DEMO_EMAIL, DEMO_PASSWORD, type FakeBackend } from '../test-utils/fake-backend';
import { enrollBiometrics, resetSecureDevice, secureStore } from '../test-utils/secure-device';

const TOKEN_KEY = 'com.fieldops.auth.refresh-token';
const META_KEY = 'com.fieldops.auth.session-meta';

let backend: FakeBackend;

beforeEach(() => {
  resetSecureDevice();
  backend = createFakeBackend();
});

async function signedInManager() {
  const manager = createTestManager(backend);
  await manager.restore();
  await manager.signIn(DEMO_EMAIL, DEMO_PASSWORD);
  await manager.sync('manual'); // let the post-sign-in check-in settle
  return manager;
}

describe('authentication', () => {
  it('signs in successfully and stores only the refresh token in secure storage', async () => {
    const manager = await signedInManager();
    const state = manager.getState();

    expect(state.status).toBe('authenticated');
    expect(state.user?.email).toBe(DEMO_EMAIL);
    const tokenItem = secureStore.items.get(TOKEN_KEY);
    expect(tokenItem?.value).toMatch(/^rt-/);
    expect(tokenItem?.options.keychainAccessible).toBe(SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY);
    expect(tokenItem?.options.requireAuthentication).toBeUndefined();
    // The metadata entry never contains tokens; access tokens are never persisted.
    const meta = secureStore.items.get(META_KEY)?.value ?? '';
    expect(meta).not.toMatch(/rt-|at-/);
    expect([...secureStore.items.values()].some((i) => i.value.startsWith('at-'))).toBe(false);
  });

  it('rejects invalid credentials without storing anything', async () => {
    const manager = createTestManager(backend);
    await manager.restore();
    await expect(manager.signIn(DEMO_EMAIL, 'wrong-password')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(manager.getState().status).toBe('signedOut');
    expect(secureStore.items.size).toBe(0);
  });

  it('restores a saved session on launch using the stored refresh token', async () => {
    await signedInManager();
    backend.state.calls.length = 0;

    const relaunched = createTestManager(backend);
    await relaunched.restore();

    expect(relaunched.getState().status).toBe('authenticated');
    expect(backend.state.calls).toContain('POST /auth/refresh');
    await expect(relaunched.api.workOrders.list()).resolves.toHaveLength(1);
  });

  it('refreshes an expired access token transparently', async () => {
    const manager = await signedInManager();
    backend.advance(301_000); // past the 300 s access-token TTL
    backend.state.calls.length = 0;

    await expect(manager.api.workOrders.list()).resolves.toHaveLength(1);
    expect(backend.state.calls).toEqual(['POST /auth/refresh', 'GET /workOrders']);
  });

  it('refreshes reactively when the server reports TOKEN_EXPIRED', async () => {
    const manager = await signedInManager();
    backend.state.accessTokens.forEach((_v, k) => backend.state.accessTokens.set(k, 0)); // server-side expiry
    backend.state.calls.length = 0;

    await expect(manager.api.workOrders.list()).resolves.toHaveLength(1);
    expect(backend.state.calls).toEqual(['GET /workOrders', 'POST /auth/refresh', 'GET /workOrders']);
  });

  it('signs out securely: server session invalidated and secure storage wiped', async () => {
    const manager = await signedInManager();
    const refreshToken = secureStore.items.get(TOKEN_KEY)!.value;

    await manager.signOut();

    expect(manager.getState().status).toBe('signedOut');
    expect(secureStore.items.size).toBe(0);
    expect(backend.state.refreshTokens.has(refreshToken)).toBe(false);
    await expect(manager.api.workOrders.list()).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  });

  it('expires the session when the stored refresh token is no longer valid', async () => {
    await signedInManager();
    backend.state.refreshTokens.clear();

    const relaunched = createTestManager(backend);
    await relaunched.restore();

    expect(relaunched.getState().status).toBe('signedOut');
    expect(relaunched.getState().notice?.title).toBe('Session expired');
    expect(secureStore.items.size).toBe(0);
  });

  it('keeps the saved session when the server is unreachable during restore', async () => {
    await signedInManager();
    backend.state.offline = true;

    const relaunched = createTestManager(backend);
    await relaunched.restore();

    expect(relaunched.getState().status).toBe('locked');
    expect(relaunched.getState().notice?.title).toMatch(/reach FieldOps/);
    expect(secureStore.items.has(TOKEN_KEY)).toBe(true);
  });
});

describe('biometric requirements', () => {
  beforeEach(() => {
    backend.updatePolicy({ requireBiometrics: true });
  });

  it('binds the refresh token to biometrics and verifies with a real prompt on sign-in', async () => {
    enrollBiometrics('face');
    const manager = await signedInManager();

    expect(manager.getState().status).toBe('authenticated');
    expect(manager.getState().credential?.biometricProtected).toBe(true);
    const item = secureStore.items.get(TOKEN_KEY)!;
    expect(item.options.requireAuthentication).toBe(true);
    expect(item.options.keychainAccessible).toBe(SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY);
    expect(secureStore.promptCount).toBe(1); // iOS read-back after storing
  });

  it('blocks sign-in when biometrics are required but unavailable', async () => {
    const manager = createTestManager(backend);
    await manager.restore();

    const attempt = manager.signIn(DEMO_EMAIL, DEMO_PASSWORD);
    await expect(attempt).rejects.toBeInstanceOf(SessionError);
    await expect(attempt).rejects.toMatchObject({ code: 'BIOMETRICS_REQUIRED' });
    expect(manager.getState().status).toBe('signedOut');
    expect(secureStore.items.size).toBe(0);
    expect(backend.state.refreshTokens.size).toBe(0); // server session abandoned
  });

  it('blocks sign-in when the biometric prompt is canceled', async () => {
    enrollBiometrics('face');
    secureStore.nextPrompt = ['cancel'];
    const manager = createTestManager(backend);
    await manager.restore();

    await expect(manager.signIn(DEMO_EMAIL, DEMO_PASSWORD)).rejects.toMatchObject({ code: 'BIOMETRICS_REQUIRED' });
    expect(manager.getState().status).toBe('signedOut');
    expect(secureStore.items.size).toBe(0);
  });

  it('requires a biometric unlock to restore a protected session', async () => {
    enrollBiometrics('face');
    await signedInManager();

    const relaunched = createTestManager(backend);
    await relaunched.restore();
    expect(relaunched.getState().status).toBe('locked'); // no silent restore

    secureStore.nextPrompt = ['cancel'];
    await relaunched.unlock();
    expect(relaunched.getState().status).toBe('locked');
    expect(relaunched.getState().notice?.title).toBe('Unlock canceled');
    expect(secureStore.items.has(TOKEN_KEY)).toBe(true);

    await relaunched.unlock();
    expect(relaunched.getState().status).toBe('authenticated');
  });

  it('discards the credential when biometrics were removed from the device', async () => {
    enrollBiometrics('face');
    await signedInManager();

    const relaunched = createTestManager(backend);
    await relaunched.restore();
    secureStore.nextPrompt = ['not_enrolled'];
    await relaunched.unlock();

    expect(relaunched.getState().status).toBe('signedOut');
    expect(relaunched.getState().notice?.title).toBe('Biometric unlock unavailable');
    expect(secureStore.items.size).toBe(0);
  });

  it('blocks sign-in when only weak biometrics are enrolled', async () => {
    enrollBiometrics('fingerprint', { strong: false });
    const manager = createTestManager(backend);
    await manager.restore();

    await expect(manager.signIn(DEMO_EMAIL, DEMO_PASSWORD)).rejects.toMatchObject({ code: 'BIOMETRICS_REQUIRED' });
    expect(secureStore.items.size).toBe(0);
    expect(backend.state.refreshTokens.size).toBe(0);
  });

  it('prompts once on Android, while encrypting with the auth-bound Keystore key', async () => {
    const restore = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      enrollBiometrics('fingerprint');
      const manager = await signedInManager();

      expect(manager.getState().credential).toEqual({ biometricProtected: true, storage: 'android_keystore' });
      expect(secureStore.items.get(TOKEN_KEY)?.options.requireAuthentication).toBe(true);
      expect(secureStore.promptCount).toBe(1); // no read-back needed on Android
    } finally {
      restore.restore();
    }
  });

  it('discards the credential when the OS invalidated it after a biometric change', async () => {
    enrollBiometrics('face');
    await signedInManager();

    const relaunched = createTestManager(backend);
    await relaunched.restore();
    secureStore.invalidateBiometricItems();
    await relaunched.unlock();

    expect(relaunched.getState().status).toBe('signedOut');
    expect(relaunched.getState().notice?.title).toBe('Biometric unlock unavailable');
    expect(secureStore.items.size).toBe(0);
  });

  it('ends an unprotected session when the policy starts requiring biometrics', async () => {
    backend.updatePolicy({ requireBiometrics: false });
    const manager = await signedInManager();

    backend.updatePolicy({ requireBiometrics: true });
    await manager.sync('manual');

    expect(manager.getState().status).toBe('signedOut');
    expect(manager.getState().notice?.title).toBe('Biometric sign-in required');
    expect(secureStore.items.size).toBe(0);
  });
});

describe('device compliance and revocation', () => {
  it('reports a compliant device with the active policy version after check-in', async () => {
    const manager = await signedInManager();
    backend.updatePolicy({ allowOfflineAccess: true });
    await manager.sync('manual');

    const compliance = complianceFor(manager.getState());
    expect(compliance.state).toBe('compliant');
    expect(compliance.allowed).toBe(true);
    expect(manager.getState().policy?.policyVersion).toBe(2);
    expect(manager.getState().device?.policyVersion).toBe(2);
  });

  it('detects remote revocation on sync, wipes credentials, and returns to sign-in', async () => {
    const manager = await signedInManager();
    backend.revokeDevice();

    await manager.sync('manual');

    const state = manager.getState();
    expect(state.status).toBe('signedOut');
    expect(state.notice).toMatchObject({ tone: 'danger', title: 'Access revoked' });
    expect(secureStore.items.size).toBe(0);
    await expect(manager.api.workOrders.list()).rejects.toBeInstanceOf(ApiError);
  });

  it('detects revocation from any protected request', async () => {
    const manager = await signedInManager();
    backend.revokeDevice();

    await expect(manager.api.workOrders.list()).rejects.toMatchObject({ code: 'DEVICE_REVOKED' });
    expect(manager.getState().status).toBe('signedOut');
    expect(secureStore.items.size).toBe(0);
  });

  it('blocks sign-in on a revoked device and explains why', async () => {
    backend.revokeDevice();
    const manager = createTestManager(backend);
    await manager.restore();

    await manager.signIn(DEMO_EMAIL, DEMO_PASSWORD);

    expect(manager.getState().status).toBe('signedOut');
    expect(manager.getState().notice?.title).toBe('Access revoked');
  });

  it('ends the session when the policy disallows the device', async () => {
    const manager = await signedInManager();
    backend.updatePolicy({ deviceAllowed: false });

    await manager.sync('periodic');

    expect(manager.getState().status).toBe('signedOut');
    expect(manager.getState().notice?.title).toBe('Device not compliant');
  });

  it('hides protected data offline when the policy forbids offline access', async () => {
    const manager = await signedInManager();
    backend.state.offline = true;
    backend.advance(20_000); // policy check is stale

    await expect(manager.ensureAccess()).resolves.toBe(false);
    expect(manager.getState().connectivity).toBe('offline');
    expect(complianceFor(manager.getState()).state).toBe('unverified');
    expect(manager.getState().status).toBe('authenticated'); // session kept, data hidden
  });

  it('re-verifies policy before protected resources when the last check is stale', async () => {
    const manager = await signedInManager();
    await manager.sync('manual');
    backend.state.calls.length = 0;

    await manager.ensureAccess();
    expect(backend.state.calls).toEqual([]); // fresh: no extra request

    backend.advance(16_000);
    await manager.ensureAccess();
    expect(backend.state.calls).toContain('PATCH /devices/d-2001');
  });
});
