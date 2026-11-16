import { resolveApiBaseUrl } from '@/services/api/config';
import { evaluateCompliance } from '@/services/device/compliance';
import type { Device, DevicePolicy } from '@/types/api';

const device: Device = {
  id: 'd-1',
  employeeId: 'u-1',
  deviceName: 'Test',
  platform: 'ios',
  osVersion: '19',
  appVersion: '1.0.0',
  managed: true,
  status: 'active',
  enrolledAt: '2026-01-01T00:00:00.000Z',
  lastCheckIn: null,
  policyId: 'p-1',
  policyVersion: 3,
  accessRevoked: false,
  biometricsEnrolled: true,
  secureStorage: 'ios_keychain',
};
const policy: DevicePolicy = {
  id: 'p-1',
  name: 'Field Secure',
  deviceAllowed: true,
  requireBiometrics: true,
  allowOfflineAccess: false,
  policyVersion: 3,
};
const base = { device, policy, credentialBiometricProtected: true, connectivity: 'online' as const };

describe('evaluateCompliance', () => {
  it('is compliant when every policy rule is met', () => {
    const result = evaluateCompliance(base);
    expect(result.state).toBe('compliant');
    expect(result.allowed).toBe(true);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it('reports revoked access ahead of any other failure', () => {
    const result = evaluateCompliance({ ...base, device: { ...device, accessRevoked: true }, policy: { ...policy, deviceAllowed: false } });
    expect(result.state).toBe('revoked');
    expect(result.allowed).toBe(false);
  });

  it('is non-compliant when biometrics are required but credentials are not bound to them', () => {
    const result = evaluateCompliance({ ...base, credentialBiometricProtected: false });
    expect(result.state).toBe('non_compliant');
    expect(result.checks.find((c) => c.id === 'biometrics')?.passed).toBe(false);
  });

  it('is non-compliant when the policy disallows the device', () => {
    expect(evaluateCompliance({ ...base, policy: { ...policy, deviceAllowed: false } }).state).toBe('non_compliant');
  });

  it('is unverified offline unless the policy allows offline access', () => {
    expect(evaluateCompliance({ ...base, connectivity: 'offline' }).state).toBe('unverified');
    const allowed = evaluateCompliance({ ...base, connectivity: 'offline', policy: { ...policy, allowOfflineAccess: true } });
    expect(allowed.state).toBe('compliant');
  });

  it('flags a pending policy version without blocking access', () => {
    const result = evaluateCompliance({ ...base, device: { ...device, policyVersion: 2 } });
    expect(result.allowed).toBe(true);
    expect(result.checks.find((c) => c.id === 'policyVersion')?.passed).toBe(false);
  });

  it('is unverified before any policy has been fetched', () => {
    expect(evaluateCompliance({ ...base, device: null, policy: null })).toMatchObject({ state: 'unverified', allowed: false });
  });
});

describe('resolveApiBaseUrl', () => {
  it('prefers EXPO_PUBLIC_API_URL and trims trailing slashes', () => {
    expect(resolveApiBaseUrl({ envUrl: 'http://10.1.2.3:4000/', hostUri: '192.168.0.2:8081', platform: 'ios' })).toBe(
      'http://10.1.2.3:4000',
    );
  });

  it('uses the Metro host IP so physical devices reach the mock API', () => {
    expect(resolveApiBaseUrl({ hostUri: '192.168.0.2:8081', platform: 'android' })).toBe('http://192.168.0.2:3000');
    expect(resolveApiBaseUrl({ hostUri: '192.168.0.2:8081', envPort: '3100', platform: 'ios' })).toBe(
      'http://192.168.0.2:3100',
    );
  });

  it('falls back to 10.0.2.2 on the Android emulator, never localhost', () => {
    expect(resolveApiBaseUrl({ hostUri: 'localhost:8081', platform: 'android' })).toBe('http://10.0.2.2:3000');
    expect(resolveApiBaseUrl({ platform: 'android' })).toBe('http://10.0.2.2:3000');
  });

  it('falls back to localhost on the iOS Simulator', () => {
    expect(resolveApiBaseUrl({ platform: 'ios' })).toBe('http://localhost:3000');
  });
});
