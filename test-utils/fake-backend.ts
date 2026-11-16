/**
 * In-process fake of the mock API used by Jest tests. It follows the same contract as
 * mock-api/server.js (endpoints, error codes) so the real ApiClient, SessionManager and
 * secure credential store can be exercised end to end without a network.
 */
import { ApiClient } from '@/services/api/client';
import { createFieldOpsApi } from '@/services/api/fieldops-api';
import { SessionManager } from '@/services/auth/session-manager';
import type { BiometryCapability } from '@/services/secure-store/biometrics';
import { getBiometryCapability } from '@/services/secure-store/biometrics';
import { secureCredentialStore } from '@/services/secure-store/secure-credential-store';
import type { Device, DevicePolicy, User, WorkOrder } from '@/types/api';

export const DEMO_EMAIL = 'maria.alvarez@fieldops.example';
export const DEMO_PASSWORD = 'FieldOps!2026';

type FakeResponse = { ok: boolean; status: number; json: () => Promise<unknown> };

export function createFakeBackend({ accessTokenTtlSeconds = 300 } = {}) {
  let clock = Date.parse('2026-11-16T09:00:00.000Z');
  let counter = 0;

  const user: User & { password: string } = {
    id: 'u-1001',
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    name: 'Maria Alvarez',
    role: 'Field Technician',
  };
  const state = {
    device: {
      id: 'd-2001',
      employeeId: 'u-1001',
      deviceName: 'FieldOps iPhone 0412',
      platform: 'ios',
      osVersion: '19.1',
      appVersion: '1.0.0',
      managed: true,
      status: 'active',
      enrolledAt: '2026-03-04T09:15:00.000Z',
      lastCheckIn: null,
      policyId: 'pol-secure',
      policyVersion: 1,
      accessRevoked: false,
      biometricsEnrolled: null,
      secureStorage: null,
    } as Device,
    policy: {
      id: 'pol-secure',
      name: 'Field Secure',
      deviceAllowed: true,
      requireBiometrics: false,
      allowOfflineAccess: false,
      policyVersion: 1,
    } as DevicePolicy,
    workOrders: [
      {
        id: 'wo-5101',
        title: 'Replace failed rooftop HVAC compressor',
        customerName: 'Northgate Medical Plaza',
        address: '1180 Northgate Blvd',
        description: 'Unit RTU-3 tripped overnight.',
        priority: 'critical',
        status: 'in_progress',
        assignedEmployeeId: 'u-1001',
      },
    ] as WorkOrder[],
    accessTokens: new Map<string, number>(),
    refreshTokens: new Set<string>(),
    offline: false,
    calls: [] as string[],
  };

  const json = (status: number, body?: unknown): FakeResponse => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  const err = (status: number, code: string, message = code) => json(status, { error: { code, message } });

  function denial(): FakeResponse | null {
    if (state.device.accessRevoked) return err(403, 'DEVICE_REVOKED', 'Your administrator revoked FieldOps access for this device.');
    if (!state.policy.deviceAllowed) return err(403, 'DEVICE_NOT_ALLOWED', 'This device does not meet the security policy.');
    return null;
  }

  function issue() {
    counter += 1;
    const accessToken = `at-${counter}`;
    state.accessTokens.set(accessToken, clock + accessTokenTtlSeconds * 1000);
    return { accessToken, accessTokenExpiresIn: accessTokenTtlSeconds };
  }

  const publicUser = () => {
    const { password: _password, ...rest } = user;
    return rest;
  };

  const fetchImpl = async (input: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) => {
    const method = init.method ?? 'GET';
    // Avoid relying on a URL polyfill in the React Native Jest environment.
    const url = { pathname: input.replace(/^https?:\/\/[^/]+/, '').split('?')[0] };
    state.calls.push(`${method} ${url.pathname}`);
    if (state.offline) throw new TypeError('Network request failed');
    const body = init.body ? JSON.parse(init.body) : {};

    if (url.pathname === '/auth/login') {
      if (body.email !== user.email || body.password !== user.password) {
        return err(401, 'INVALID_CREDENTIALS', 'The email or password is incorrect.');
      }
      const denied = denial();
      if (denied) return denied;
      counter += 1;
      const refreshToken = `rt-${counter}`;
      state.refreshTokens.add(refreshToken);
      return json(200, { ...issue(), refreshToken, user: publicUser(), device: state.device, policy: state.policy });
    }
    if (url.pathname === '/auth/refresh') {
      const denied = denial();
      if (denied) return denied;
      if (!state.refreshTokens.has(body.refreshToken)) return err(401, 'INVALID_REFRESH_TOKEN');
      return json(200, { ...issue(), user: publicUser(), device: state.device, policy: state.policy });
    }
    if (url.pathname === '/auth/logout') {
      state.refreshTokens.delete(body.refreshToken);
      return json(204);
    }

    const token = (init.headers?.Authorization ?? '').replace('Bearer ', '');
    const expiresAt = state.accessTokens.get(token);
    if (expiresAt === undefined) return err(401, 'INVALID_TOKEN');
    if (expiresAt <= clock) return err(401, 'TOKEN_EXPIRED');
    const denied = denial();
    if (denied) return denied;

    if (url.pathname === `/devices/${state.device.id}`) {
      if (method === 'PATCH') {
        state.device = { ...state.device, lastCheckIn: new Date(clock).toISOString(), policyVersion: state.policy.policyVersion };
      }
      return json(200, state.device);
    }
    if (url.pathname === `/policies/${state.policy.id}`) return json(200, state.policy);
    if (url.pathname === '/workOrders') return json(200, state.workOrders);
    if (url.pathname.startsWith('/workOrders/')) {
      const order = state.workOrders.find((o) => url.pathname.endsWith(o.id));
      return order ? json(200, order) : err(404, 'NOT_FOUND');
    }
    if (url.pathname === `/admin/devices/${state.device.id}/revoke`) {
      state.device = { ...state.device, accessRevoked: true, status: 'revoked' };
      state.refreshTokens.clear();
      return json(200, { device: state.device });
    }
    return err(404, 'NOT_FOUND');
  };

  return {
    state,
    fetch: fetchImpl as unknown as typeof fetch,
    now: () => clock,
    advance: (ms: number) => {
      clock += ms;
    },
    revokeDevice() {
      state.device = { ...state.device, accessRevoked: true, status: 'revoked' };
      state.refreshTokens.clear();
    },
    updatePolicy(changes: Partial<DevicePolicy>) {
      state.policy = { ...state.policy, ...changes, policyVersion: state.policy.policyVersion + 1 };
    },
  };
}

export type FakeBackend = ReturnType<typeof createFakeBackend>;

/** Builds a SessionManager wired to the fake backend and the (mocked) expo-secure-store module. */
export function createTestManager(
  backend: FakeBackend,
  overrides: { getBiometry?: () => Promise<BiometryCapability> } = {},
) {
  const client = new ApiClient('http://mock-api.test', backend.fetch, 5_000);
  return new SessionManager({
    client,
    api: createFieldOpsApi(client),
    store: secureCredentialStore,
    getBiometry: overrides.getBiometry ?? getBiometryCapability,
    getDeviceReport: (extra = {}) => ({ platform: 'ios', appVersion: '1.0.0', model: 'iPhone 17', ...extra }),
    now: backend.now,
    policyMaxAgeMs: 15_000,
  });
}
