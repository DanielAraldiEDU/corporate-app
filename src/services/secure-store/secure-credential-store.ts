/**
 * Secure credential storage — REAL expo-secure-store integration.
 *
 * iOS: items live in the iOS Keychain. Biometric items use the `biometryCurrentSet` access
 * control, so the system shows Face ID / Touch ID before releasing the secret, and the item
 * becomes unreadable if the enrolled biometrics change. iOS does not prompt when an item is
 * created, so the binding is proven by reading the item back once.
 *
 * Android: items are encrypted with AES-GCM keys held in the Android Keystore. Biometric items
 * use a key created with `setUserAuthenticationRequired(true)`, so BiometricPrompt (Class 3 /
 * BIOMETRIC_STRONG) is shown for both encryption and decryption. The key is invalidated when
 * a new biometric is enrolled. expo-secure-store never falls back to non-auth storage: it
 * throws when strong biometrics are unavailable.
 *
 * In both cases an invalidated item reads back as `null` rather than throwing.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const REFRESH_TOKEN_KEY = 'com.fieldops.auth.refresh-token';
const SESSION_META_KEY = 'com.fieldops.auth.session-meta';

/** Identifies the platform backend that holds the credential (reported to the server, shown in settings). */
export type StorageBackend = 'ios_keychain' | 'android_keystore';

/** Non-secret profile data kept beside the token so the app can show a lock screen without prompting. */
export type StoredSessionMeta = {
  userId: string;
  deviceId: string;
  email: string;
  name: string;
  biometricProtected: boolean;
  storage: StorageBackend;
  savedAt: string;
};

export type SaveResult = { storage: StorageBackend; biometricProtected: boolean };

export type SecureStoreErrorKind =
  | 'canceled'
  | 'not_enrolled'
  | 'passcode_not_set'
  | 'lockout'
  | 'unavailable'
  | 'protection_unavailable'
  | 'storage'
  | 'unknown';

export class SecureStoreError extends Error {
  constructor(
    readonly kind: SecureStoreErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'SecureStoreError';
  }
}

/** Text shown in the system biometric prompt (Android: prompt title, iOS: Face ID / Touch ID reason). */
export type AuthenticationPrompt = string;

function storageBackend(): StorageBackend {
  return Platform.OS === 'ios' ? 'ios_keychain' : 'android_keystore';
}

/**
 * expo-secure-store reports failures as native error messages only (no error codes), so the
 * messages below are matched against the strings raised by the iOS and Android modules.
 */
function mapNativeError(error: unknown): SecureStoreError {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/cancel/i.test(message)) {
    return new SecureStoreError('canceled', 'Biometric authentication was canceled.');
  }
  if (/no biometrics|not enrolled/i.test(message)) {
    return new SecureStoreError(
      'not_enrolled',
      'No biometrics are enrolled on this device. Set up Face ID or a fingerprint in device Settings.',
    );
  }
  if (/lockout/i.test(message)) {
    return new SecureStoreError('lockout', 'Biometrics are locked after too many attempts. Unlock your device and try again.');
  }
  if (/no device credential|no user authentication method/i.test(message)) {
    return new SecureStoreError('passcode_not_set', 'Set a device passcode or screen lock to store corporate credentials.');
  }
  if (/hardware|unsupported|timeout|invalidated|in progress|not in the foreground|interaction is not allowed|update is required|status is unknown/i.test(message)) {
    return new SecureStoreError('unavailable', 'Biometric authentication is not available right now.');
  }
  if (/keystore|keychain|encrypt|decrypt|write|delete/i.test(message)) {
    return new SecureStoreError('storage', 'Secure storage could not be accessed on this device.');
  }
  return new SecureStoreError('unknown', 'Secure storage request failed.');
}

async function guard<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof SecureStoreError) throw error;
    throw mapNativeError(error);
  }
}

/**
 * Stores the refresh token. With `requireBiometrics` the token is bound to biometric
 * authentication and the user is challenged once to prove the binding works:
 * Android challenges during encryption; iOS is challenged by reading the item back.
 */
export async function saveSession(
  refreshToken: string,
  meta: Omit<StoredSessionMeta, 'storage' | 'savedAt' | 'biometricProtected'>,
  { requireBiometrics, prompt }: { requireBiometrics: boolean; prompt: AuthenticationPrompt },
): Promise<SaveResult> {
  await clearSession();

  await guard(async () => {
    if (!requireBiometrics) {
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      return;
    }

    if (!SecureStore.canUseBiometricAuthentication()) {
      throw new SecureStoreError(
        'protection_unavailable',
        'This device cannot bind credentials to biometrics. Enroll a fingerprint or face unlock and try again.',
      );
    }
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken, {
      requireAuthentication: true,
      authenticationPrompt: prompt,
      keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
    });

    if (Platform.OS === 'ios') {
      const verified = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY, { authenticationPrompt: prompt });
      if (verified !== refreshToken) {
        throw new SecureStoreError('unknown', 'Biometric verification of the stored credential failed.');
      }
    }
  }).catch(async (error) => {
    await clearSession();
    throw error;
  });

  const storage = storageBackend();
  const fullMeta: StoredSessionMeta = {
    ...meta,
    biometricProtected: requireBiometrics,
    storage,
    savedAt: new Date().toISOString(),
  };
  await guard(() =>
    SecureStore.setItemAsync(SESSION_META_KEY, JSON.stringify(fullMeta), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  ).catch(async (error) => {
    await clearSession();
    throw error;
  });

  return { storage, biometricProtected: requireBiometrics };
}

/**
 * Reads the refresh token. Biometric-bound items trigger the system prompt.
 * A biometric-bound item that reads back as `null` was invalidated by the OS
 * (biometrics changed), which is reported as an error rather than a silent sign-out.
 */
export async function readRefreshToken(prompt: AuthenticationPrompt): Promise<string | null> {
  const meta = await readSessionMeta();
  if (!meta) return null;

  const token = await guard(() => SecureStore.getItemAsync(REFRESH_TOKEN_KEY, { authenticationPrompt: prompt }));
  if (token === null && meta.biometricProtected) {
    throw new SecureStoreError(
      'unavailable',
      'Your enrolled biometrics changed, so the saved credential can no longer be unlocked.',
    );
  }
  return token;
}

/** Reads non-secret session metadata. Never prompts. */
export async function readSessionMeta(): Promise<StoredSessionMeta | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_META_KEY);
    if (!raw) {
      // No metadata means no usable session; drop any token left by an interrupted save.
      await clearSession();
      return null;
    }
    return JSON.parse(raw) as StoredSessionMeta;
  } catch {
    await clearSession();
    return null;
  }
}

/** Removes every FieldOps credential from secure storage. Deleting never prompts. */
export async function clearSession(): Promise<void> {
  await Promise.allSettled([SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY), SecureStore.deleteItemAsync(SESSION_META_KEY)]);
}

export const secureCredentialStore = { saveSession, readRefreshToken, readSessionMeta, clearSession };
export type SecureCredentialStore = typeof secureCredentialStore;
