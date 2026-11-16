import { ApiClient } from '@/services/api/client';
import { apiConfig } from '@/services/api/config';
import { createFieldOpsApi } from '@/services/api/fieldops-api';
import { getDeviceReport } from '@/services/device/device-info';
import { getBiometryCapability } from '@/services/secure-store/biometrics';
import { secureCredentialStore } from '@/services/secure-store/secure-credential-store';

import { SessionManager } from './session-manager';

export * from './session-manager';

/** Wires the session manager to the real API client and react-native-keychain store. */
export function createSessionManager(): SessionManager {
  const client = new ApiClient(apiConfig.baseUrl, undefined, apiConfig.requestTimeoutMs);
  return new SessionManager({
    client,
    api: createFieldOpsApi(client),
    store: secureCredentialStore,
    getBiometry: getBiometryCapability,
    getDeviceReport,
    policyMaxAgeMs: apiConfig.policyMaxAgeMs,
  });
}
