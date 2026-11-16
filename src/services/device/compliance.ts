/**
 * Device compliance evaluation — MDM SIMULATION.
 *
 * The backend is the authority (it rejects requests from revoked or disallowed devices);
 * this pure function mirrors those rules on the client so screens can explain the state
 * and hide protected content without waiting for a failing request.
 */
import type { Device, DevicePolicy } from '@/types/api';

export type ComplianceState = 'compliant' | 'non_compliant' | 'revoked' | 'unverified';

export type ComplianceCheck = {
  id: 'managed' | 'access' | 'deviceAllowed' | 'biometrics' | 'connectivity' | 'policyVersion';
  label: string;
  passed: boolean;
  detail: string;
};

export type ComplianceInput = {
  device: Device | null;
  policy: DevicePolicy | null;
  /** Whether the stored refresh token is bound to biometric authentication. */
  credentialBiometricProtected: boolean;
  connectivity: 'online' | 'offline';
};

export type ComplianceResult = {
  state: ComplianceState;
  /** True when protected corporate resources may be shown. */
  allowed: boolean;
  checks: ComplianceCheck[];
  summary: string;
};

export function evaluateCompliance({
  device,
  policy,
  credentialBiometricProtected,
  connectivity,
}: ComplianceInput): ComplianceResult {
  if (!device || !policy) {
    return {
      state: 'unverified',
      allowed: false,
      checks: [],
      summary: 'Device status has not been verified with FieldOps yet.',
    };
  }

  const checks: ComplianceCheck[] = [
    {
      id: 'managed',
      label: 'Device management',
      passed: device.managed,
      detail: device.managed ? 'Enrolled and managed' : 'Not enrolled in device management',
    },
    {
      id: 'access',
      label: 'Access authorization',
      passed: !device.accessRevoked,
      detail: device.accessRevoked ? 'Access revoked by administrator' : 'Authorized',
    },
    {
      id: 'deviceAllowed',
      label: 'Device allowed by policy',
      passed: policy.deviceAllowed,
      detail: policy.deviceAllowed ? 'Allowed' : 'Blocked by policy',
    },
    {
      id: 'biometrics',
      label: 'Biometric authentication',
      passed: !policy.requireBiometrics || credentialBiometricProtected,
      detail: policy.requireBiometrics
        ? credentialBiometricProtected
          ? 'Required · credentials bound to biometrics'
          : 'Required · credentials not biometric-protected'
        : 'Not required by policy',
    },
    {
      id: 'connectivity',
      label: 'Connectivity',
      passed: connectivity === 'online' || policy.allowOfflineAccess,
      detail:
        connectivity === 'online'
          ? 'Verified with server'
          : policy.allowOfflineAccess
            ? 'Offline · permitted by policy'
            : 'Offline · policy requires verification',
    },
    {
      id: 'policyVersion',
      label: 'Policy version',
      passed: device.policyVersion === policy.policyVersion,
      detail:
        device.policyVersion === policy.policyVersion
          ? `v${policy.policyVersion} applied`
          : `v${policy.policyVersion} pending (device on v${device.policyVersion})`,
    },
  ];

  if (device.accessRevoked) {
    return { state: 'revoked', allowed: false, checks, summary: 'Access to FieldOps was revoked for this device.' };
  }
  const blocking = checks.filter((c) => !c.passed && c.id !== 'policyVersion');
  if (blocking.some((c) => c.id === 'connectivity') && blocking.length === 1) {
    return {
      state: 'unverified',
      allowed: false,
      checks,
      summary: 'Your policy requires an online check before corporate data is shown.',
    };
  }
  if (blocking.length > 0) {
    return {
      state: 'non_compliant',
      allowed: false,
      checks,
      summary: `Non-compliant: ${blocking.map((c) => c.label.toLowerCase()).join(', ')}.`,
    };
  }
  return { state: 'compliant', allowed: true, checks, summary: 'This device meets the active security policy.' };
}
