/**
 * Typed handles on the expo-secure-store and expo-local-authentication test doubles
 * (__mocks__/), plus helpers that keep both in sync with one simulated device.
 */
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

import type { LocalAuthMock } from '../__mocks__/expo-local-authentication';
import type { SecureStoreMock } from '../__mocks__/expo-secure-store';

export const secureStore = (SecureStore as unknown as { __secureStore: SecureStoreMock }).__secureStore;
export const localAuth = (LocalAuthentication as unknown as { __localAuth: LocalAuthMock }).__localAuth;

/** Device with a screen lock and no biometrics. */
export function resetSecureDevice() {
  secureStore.reset();
  localAuth.reset();
}

/**
 * Enrolls biometrics on the simulated device. `strong: false` models Class 2 biometrics that
 * expo-local-authentication reports but expo-secure-store cannot bind credentials to.
 */
export function enrollBiometrics(kind: 'face' | 'fingerprint', { strong = true } = {}) {
  const { FACIAL_RECOGNITION, FINGERPRINT } = LocalAuthentication.AuthenticationType;
  localAuth.types = [kind === 'face' ? FACIAL_RECOGNITION : FINGERPRINT];
  localAuth.enrolled = true;
  localAuth.level = strong
    ? LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG
    : LocalAuthentication.SecurityLevel.BIOMETRIC_WEAK;
  secureStore.biometricsEnrolled = strong;
}
