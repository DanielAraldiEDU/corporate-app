/** API models returned by the FieldOps mock backend (mock-api/). */

export type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  region?: string;
  employeeNumber?: string;
};

export type DeviceStatus = 'active' | 'revoked' | 'quarantined' | (string & {});

export type Device = {
  id: string;
  employeeId: string;
  deviceName: string;
  platform: string;
  osVersion: string | null;
  appVersion: string | null;
  model?: string;
  managed: boolean;
  status: DeviceStatus;
  enrolledAt: string;
  lastCheckIn: string | null;
  policyId: string;
  /** Policy version the device last acknowledged during check-in. */
  policyVersion: number;
  accessRevoked: boolean;
  biometricsEnrolled: boolean | null;
  secureStorage: string | null;
};

export type DevicePolicy = {
  id: string;
  name: string;
  description?: string;
  deviceAllowed: boolean;
  requireBiometrics: boolean;
  allowOfflineAccess: boolean;
  policyVersion: number;
  updatedAt?: string;
};

export type WorkOrderPriority = 'low' | 'medium' | 'high' | 'critical';
export type WorkOrderStatus = 'open' | 'in_progress' | 'on_hold' | 'completed';

export type WorkOrder = {
  id: string;
  title: string;
  customerName: string;
  contactName?: string;
  contactPhone?: string;
  address: string;
  description: string;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  scheduledFor?: string;
  estimatedHours?: number;
  assetId?: string;
  assignedEmployeeId: string;
};

export type AuditLog = {
  id: string;
  employeeId: string;
  deviceId: string | null;
  action: string;
  timestamp: string;
  description: string;
};

/** Device metadata the app reports on sign-in and during check-in. */
export type DeviceReport = {
  platform: string;
  osVersion?: string;
  appVersion?: string;
  model?: string;
  biometricsEnrolled?: boolean;
  secureStorage?: string;
};

export type CheckInReason = 'login' | 'manual' | 'periodic' | 'foreground' | 'resource';

export type LoginResponse = {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  user: User;
  device: Device;
  policy: DevicePolicy;
};

export type RefreshResponse = Omit<LoginResponse, 'refreshToken'>;

export type ApiErrorBody = { error?: { code?: string; message?: string } };
