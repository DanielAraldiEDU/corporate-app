import Constants from 'expo-constants';
import { Platform } from 'react-native';

const DEFAULT_PORT = 3000;

type ResolveInput = {
  /** EXPO_PUBLIC_API_URL — always wins when set. */
  envUrl?: string;
  /** EXPO_PUBLIC_API_PORT — port used when the URL is derived. */
  envPort?: string;
  /** Metro dev-server host, e.g. "192.168.1.20:8081". Undefined in release builds. */
  hostUri?: string | null;
  platform: string;
};

/**
 * Resolves the mock API base URL.
 *
 * 1. `EXPO_PUBLIC_API_URL` (recommended for physical devices and release builds).
 * 2. In development, the LAN host of the Metro dev server. The device already reaches
 *    Metro at that address, so the mock API on the same machine is reachable too —
 *    this works for simulators, emulators, and physical devices on the same network.
 * 3. Platform loopback fallback: Android emulators reach the host machine at 10.0.2.2,
 *    the iOS Simulator shares the host network so `localhost` works there only.
 */
export function resolveApiBaseUrl({ envUrl, envPort, hostUri, platform }: ResolveInput): string {
  if (envUrl && envUrl.trim()) return envUrl.trim().replace(/\/+$/, '');
  const port = Number(envPort) || DEFAULT_PORT;
  const host = hostUri?.split(':')[0];
  if (host && host !== 'localhost' && host !== '127.0.0.1') return `http://${host}:${port}`;
  if (platform === 'android') return `http://10.0.2.2:${port}`;
  return `http://localhost:${port}`;
}

/** Centralized runtime configuration. EXPO_PUBLIC_* values are inlined at bundle time. */
export const apiConfig = {
  baseUrl: resolveApiBaseUrl({
    envUrl: process.env.EXPO_PUBLIC_API_URL,
    envPort: process.env.EXPO_PUBLIC_API_PORT,
    hostUri: Constants.expoConfig?.hostUri,
    platform: Platform.OS,
  }),
  requestTimeoutMs: 10_000,
  /** How often the app checks in with the backend while in the foreground. */
  checkInIntervalMs: (Number(process.env.EXPO_PUBLIC_CHECKIN_INTERVAL_SECONDS) || 30) * 1000,
  /** Protected screens re-verify policy if the last sync is older than this. */
  policyMaxAgeMs: 15_000,
} as const;
