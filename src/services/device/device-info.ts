import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import type { DeviceReport } from '@/types/api';

/** Metadata this app reports to the mock MDM backend on sign-in and check-in. */
export function getDeviceReport(extra: Pick<DeviceReport, 'biometricsEnrolled' | 'secureStorage'> = {}): DeviceReport {
  return {
    platform: Platform.OS,
    osVersion: Device.osVersion ?? undefined,
    appVersion: Constants.expoConfig?.version ?? undefined,
    model: Device.modelName ?? undefined,
    ...extra,
  };
}
