/**
 * Jest test double for expo-secure-store (native module unavailable in Jest).
 * Models an in-memory Keychain/Keystore. Items written with `requireAuthentication`
 * require the test to decide the outcome of the next system prompt via
 * `__secureStore.nextPrompt`. Error messages mirror the native modules, because the app
 * classifies failures by message.
 * This file is test-only: the app itself never fakes biometric results.
 */
type Options = {
  requireAuthentication?: boolean;
  authenticationPrompt?: string;
  keychainAccessible?: number;
  keychainService?: string;
};
type Item = { value: string; options: Options };
export type PromptOutcome = 'success' | 'cancel' | 'not_enrolled' | 'lockout';

export const AFTER_FIRST_UNLOCK = 0;
export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 1;
export const ALWAYS = 2;
export const WHEN_PASSCODE_SET_THIS_DEVICE_ONLY = 3;
export const ALWAYS_THIS_DEVICE_ONLY = 4;
export const WHEN_UNLOCKED = 5;
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 6;

export const __secureStore = {
  items: new Map<string, Item>(),
  /** Whether strong biometrics are enrolled (what `canUseBiometricAuthentication` reports). */
  biometricsEnrolled: false,
  /** Outcome for each upcoming biometric prompt; defaults to 'success' when empty. */
  nextPrompt: [] as PromptOutcome[],
  promptCount: 0,
  /** Simulates the OS invalidating auth-bound keys after a biometric enrollment change. */
  invalidateBiometricItems() {
    for (const item of this.items.values()) {
      if (item.options.requireAuthentication) item.value = '';
    }
  },
  reset() {
    this.items.clear();
    this.biometricsEnrolled = false;
    this.nextPrompt = [];
    this.promptCount = 0;
  },
};
export type SecureStoreMock = typeof __secureStore;

function os(): string {
  return jest.requireActual('react-native').Platform.OS;
}

function prompt() {
  __secureStore.promptCount += 1;
  const outcome = __secureStore.nextPrompt.shift() ?? 'success';
  if (outcome === 'cancel') {
    throw new Error(os() === 'ios' ? 'User canceled the operation.' : 'Could not authenticate the user: User canceled the authentication');
  }
  if (outcome === 'not_enrolled') throw new Error('Could not authenticate the user: No biometrics are currently enrolled');
  if (outcome === 'lockout') throw new Error('Could not authenticate the user: Lockout');
}

export const setItemAsync = jest.fn(async (key: string, value: string, options: Options = {}) => {
  if (options.requireAuthentication) {
    if (!__secureStore.biometricsEnrolled) {
      throw new Error('Could not authenticate the user: No biometrics are currently enrolled');
    }
    if (os() === 'android') prompt(); // Keystore auth-bound keys require auth to encrypt; iOS does not prompt on create
  }
  __secureStore.items.set(key, { value, options });
});

export const getItemAsync = jest.fn(async (key: string, _options: Options = {}) => {
  const item = __secureStore.items.get(key);
  if (!item) return null;
  if (item.options.requireAuthentication) {
    if (item.value === '') return null; // invalidated key reads back as null
    prompt();
  }
  return item.value;
});

export const deleteItemAsync = jest.fn(async (key: string, _options: Options = {}) => {
  __secureStore.items.delete(key);
});

export const canUseBiometricAuthentication = jest.fn(() => __secureStore.biometricsEnrolled);
export const isAvailableAsync = jest.fn(async () => true);
