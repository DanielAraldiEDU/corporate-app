import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export type BiometryType = 'face_id' | 'touch_id' | 'fingerprint' | 'face' | 'iris';

export type BiometryCapability = {
  /** Enrolled biometry type, or null when unavailable / not enrolled. */
  type: BiometryType | null;
  /** True only when expo-secure-store can bind credentials to biometrics on this device. */
  available: boolean;
  /** Human label: "Face ID", "Touch ID", "Fingerprint", … */
  label: string;
  /** Whether a device passcode / screen lock is configured. */
  passcodeSet: boolean;
  /** Strongest enrolled authentication level, as a human label. */
  securityLevel: string | null;
};

export const UNKNOWN_BIOMETRY: BiometryCapability = {
  type: null,
  available: false,
  label: 'Biometrics',
  passcodeSet: false,
  securityLevel: null,
};

export function biometryLabel(type: BiometryType | null): string {
  switch (type) {
    case 'face_id':
      return 'Face ID';
    case 'touch_id':
      return 'Touch ID';
    case 'fingerprint':
      return 'Fingerprint';
    case 'face':
      return 'Face unlock';
    case 'iris':
      return 'Iris unlock';
    default:
      return 'Biometrics';
  }
}

function securityLevelLabel(level: LocalAuthentication.SecurityLevel | null): string | null {
  switch (level) {
    case LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG:
      return 'Strong biometrics (Class 3)';
    case LocalAuthentication.SecurityLevel.BIOMETRIC_WEAK:
      return 'Weak biometrics (Class 2)';
    case LocalAuthentication.SecurityLevel.SECRET:
      return 'Screen lock only';
    case LocalAuthentication.SecurityLevel.NONE:
      return 'None';
    default:
      return null;
  }
}

function toBiometryType(types: LocalAuthentication.AuthenticationType[]): BiometryType | null {
  const { FACIAL_RECOGNITION, FINGERPRINT, IRIS } = LocalAuthentication.AuthenticationType;
  if (Platform.OS === 'ios') {
    if (types.includes(FACIAL_RECOGNITION)) return 'face_id';
    if (types.includes(FINGERPRINT)) return 'touch_id';
    return null;
  }
  if (types.includes(FINGERPRINT)) return 'fingerprint';
  if (types.includes(FACIAL_RECOGNITION)) return 'face';
  if (types.includes(IRIS)) return 'iris';
  return null;
}

/** Queries the OS through expo-local-authentication and expo-secure-store. Never assumes availability. */
export async function getBiometryCapability(): Promise<BiometryCapability> {
  const [types, enrolled, level] = await Promise.all([
    LocalAuthentication.supportedAuthenticationTypesAsync().catch(() => []),
    LocalAuthentication.isEnrolledAsync().catch(() => false),
    LocalAuthentication.getEnrolledLevelAsync().catch(() => null),
  ]);
  const type = enrolled ? toBiometryType(types) : null;
  let canBind = false;
  try {
    canBind = SecureStore.canUseBiometricAuthentication();
  } catch {
    canBind = false;
  }
  return {
    type,
    available: type !== null && canBind,
    label: biometryLabel(type),
    passcodeSet: level !== null && level >= LocalAuthentication.SecurityLevel.SECRET,
    securityLevel: securityLevelLabel(level),
  };
}

/** Explains why biometrics cannot be used, for display on sign-in and security screens. */
export function biometryUnavailableReason(capability: BiometryCapability): string {
  if (!capability.passcodeSet) {
    return 'This device has no passcode or screen lock. Set one up, then enroll Face ID or a fingerprint in Settings.';
  }
  if (capability.type !== null) {
    return 'The enrolled biometrics are not strong enough to protect corporate credentials. Enroll a fingerprint or Face ID.';
  }
  return Platform.select({
    ios: 'Face ID or Touch ID is not set up for this device. Enroll it in Settings › Face ID & Passcode.',
    android: 'No fingerprint or face unlock is enrolled. Add one in Settings › Security › Biometrics.',
    default: 'Biometric authentication is not available on this device.',
  });
}
