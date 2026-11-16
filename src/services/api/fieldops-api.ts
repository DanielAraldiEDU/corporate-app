import type {
  AuditLog,
  CheckInReason,
  Device,
  DevicePolicy,
  DeviceReport,
  LoginResponse,
  RefreshResponse,
  WorkOrder,
} from '@/types/api';

import type { ApiClient } from './client';

/** Typed endpoint wrappers. Each group maps to one responsibility of the mock API. */
export function createFieldOpsApi(client: ApiClient) {
  return {
    auth: {
      login: (email: string, password: string, device: DeviceReport) =>
        client.request<LoginResponse>('/auth/login', {
          method: 'POST',
          auth: false,
          body: { email, password, device },
        }),
      refresh: (refreshToken: string) =>
        client.request<RefreshResponse>('/auth/refresh', {
          method: 'POST',
          auth: false,
          body: { refreshToken },
        }),
      logout: (refreshToken: string) =>
        client.request<void>('/auth/logout', { method: 'POST', auth: false, body: { refreshToken } }),
    },
    devices: {
      get: (id: string) => client.request<Device>(`/devices/${encodeURIComponent(id)}`),
      checkIn: (id: string, report: DeviceReport, reason: CheckInReason) =>
        client.request<Device>(`/devices/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: { ...report, checkInReason: reason },
        }),
    },
    policies: {
      get: (id: string) => client.request<DevicePolicy>(`/policies/${encodeURIComponent(id)}`),
    },
    workOrders: {
      list: () => client.request<WorkOrder[]>('/workOrders', { query: { _sort: 'scheduledFor', _order: 'asc' } }),
      get: (id: string) => client.request<WorkOrder>(`/workOrders/${encodeURIComponent(id)}`),
    },
    auditLogs: {
      list: (limit = 25) => client.request<AuditLog[]>('/auditLogs', { query: { _limit: limit } }),
    },
    /** DEMONSTRATION ONLY — stands in for actions an IT admin performs in an MDM console. */
    admin: {
      revokeDevice: (id: string) =>
        client.request<{ device: Device }>(`/admin/devices/${encodeURIComponent(id)}/revoke`, { method: 'POST' }),
      updatePolicy: (id: string, changes: Partial<Pick<DevicePolicy, 'requireBiometrics' | 'allowOfflineAccess'>>) =>
        client.request<{ policy: DevicePolicy }>(`/admin/policies/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: changes,
        }),
    },
  };
}

export type FieldOpsApi = ReturnType<typeof createFieldOpsApi>;
