/** Error codes the mock API returns that mean "this device may not access corporate data". */
export const ACCESS_DENIED_CODES = ['DEVICE_REVOKED', 'DEVICE_NOT_ALLOWED', 'DEVICE_NOT_ENROLLED'] as const;
export type AccessDeniedCode = (typeof ACCESS_DENIED_CODES)[number];

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  static network(message = 'Unable to reach the FieldOps server. Check your connection and try again.') {
    return new ApiError(0, 'NETWORK_ERROR', message);
  }

  get isNetworkError() {
    return this.code === 'NETWORK_ERROR' || this.code === 'TIMEOUT';
  }

  get isAccessDenied(): boolean {
    return (ACCESS_DENIED_CODES as readonly string[]).includes(this.code);
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** User-presentable message for any thrown value. Never includes request bodies or tokens. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
