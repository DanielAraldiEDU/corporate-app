import type { ApiErrorBody } from '@/types/api';

import { ApiError } from './errors';

/**
 * Supplies tokens to the client without the client owning them. The session manager
 * implements this: the access token stays in memory and is refreshed on demand.
 */
export type AuthDelegate = {
  /** Current access token, or null when missing/expired. */
  getAccessToken(): string | null;
  /** Obtains a fresh access token (single-flight). Resolves null if the session ended. */
  refreshAccessToken(): Promise<string | null>;
  /** Called for DEVICE_REVOKED / DEVICE_NOT_ALLOWED responses from any endpoint. */
  onAccessDenied(error: ApiError): void;
};

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** Attach the bearer token (default true). Auth endpoints pass false. */
  auth?: boolean;
};

type FetchLike = typeof fetch;

const RETRYABLE_AUTH_CODES = new Set(['TOKEN_EXPIRED', 'INVALID_TOKEN']);

export class ApiClient {
  private delegate: AuthDelegate | null = null;

  constructor(
    readonly baseUrl: string,
    private readonly fetchImpl: FetchLike = (...args) => fetch(...args),
    private readonly timeoutMs = 10_000,
  ) {}

  setAuthDelegate(delegate: AuthDelegate) {
    this.delegate = delegate;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { auth = true } = options;
    let token: string | null = null;

    if (auth) {
      token = this.delegate?.getAccessToken() ?? null;
      if (!token) token = (await this.delegate?.refreshAccessToken()) ?? null;
      if (!token) throw new ApiError(401, 'SESSION_EXPIRED', 'Your session has ended. Sign in again.');
    }

    let response = await this.send(path, options, token);

    // Reactive refresh: the server is the authority on expiry (clock skew, restarts).
    if (auth && response.status === 401) {
      const error = await this.toError(response);
      if (!RETRYABLE_AUTH_CODES.has(error.code)) throw error;
      token = (await this.delegate?.refreshAccessToken()) ?? null;
      if (!token) throw error;
      response = await this.send(path, options, token);
    }

    if (!response.ok) {
      const error = await this.toError(response);
      if (error.isAccessDenied) this.delegate?.onAccessDenied(error);
      throw error;
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  private async send(path: string, options: RequestOptions, token: string | null): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(this.buildUrl(path, options.query), {
        method: options.method ?? 'GET',
        headers: {
          Accept: 'application/json',
          ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) {
        throw new ApiError(0, 'TIMEOUT', 'The FieldOps server took too long to respond.');
      }
      throw ApiError.network();
    } finally {
      clearTimeout(timer);
    }
  }

  private buildUrl(path: string, query?: RequestOptions['query']): string {
    const params = Object.entries(query ?? {})
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    return `${this.baseUrl}${path}${params ? `?${params}` : ''}`;
  }

  private async toError(response: Response): Promise<ApiError> {
    let body: ApiErrorBody | null = null;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      // Non-JSON error body; fall through to a generic message.
    }
    return new ApiError(
      response.status,
      body?.error?.code ?? `HTTP_${response.status}`,
      body?.error?.message ?? `Request failed (${response.status}).`,
    );
  }
}
