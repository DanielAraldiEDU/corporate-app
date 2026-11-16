/**
 * Jest test double for expo-local-authentication (native module unavailable in Jest).
 * Tests set `__localAuth` to describe the device's enrolled biometrics and screen lock.
 */
export enum AuthenticationType {
  FINGERPRINT = 1,
  FACIAL_RECOGNITION = 2,
  IRIS = 3,
}

export enum SecurityLevel {
  NONE = 0,
  SECRET = 1,
  BIOMETRIC_WEAK = 2,
  BIOMETRIC_STRONG = 3,
}

export const __localAuth = {
  types: [] as number[],
  enrolled: false,
  level: SecurityLevel.SECRET as number,
  reset() {
    this.types = [];
    this.enrolled = false;
    this.level = SecurityLevel.SECRET;
  },
};
export type LocalAuthMock = typeof __localAuth;

export const hasHardwareAsync = jest.fn(async () => __localAuth.types.length > 0);
export const isEnrolledAsync = jest.fn(async () => __localAuth.enrolled);
export const supportedAuthenticationTypesAsync = jest.fn(async () => __localAuth.types);
export const getEnrolledLevelAsync = jest.fn(async () => __localAuth.level);
export const authenticateAsync = jest.fn(async () => ({ success: true }));
export const cancelAuthenticate = jest.fn(async () => undefined);
