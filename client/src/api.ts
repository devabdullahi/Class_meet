/**
 * The one place that talks to the API.
 *
 * Every call goes through `request`, so there is exactly one implementation of
 * "send credentials, send the CSRF header, and turn a failure into an error
 * object the UI can render". Nothing in the app calls `fetch` directly.
 */

/** Mirrors the server's `PublicUser`. Small enough to keep in both places. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  lastLoginAt: string;
}

export interface SessionResponse {
  user: AuthUser;
}

/**
 * Mirrors `GET /api/auth/config`. The server owns these values because it is
 * the side that validates the tokens they produce.
 */
export interface AuthConfigResponse {
  /** False until ENTRA_CLIENT_ID is set in server/.env. */
  configured: boolean;
  /** The server's copy of the Application (client) ID. Compared with ours. */
  clientId: string;
  tenantId: string;
  tenantDisplayName: string;
  /** `api://<client-id>/<scope>` — what MSAL must request. Blank if unconfigured. */
  apiScope: string;
  /**
   * DEVELOPMENT SIGN-IN BYPASS — REMOVE BEFORE THE PILOT. True only when the
   * server has ALLOW_DEV_LOGIN=true and is not in production.
   */
  devLoginEnabled: boolean;
}

/** An API failure with a message that is safe and useful to display. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  get isUnauthenticated(): boolean {
    return this.status === 401;
  }
}

function extractError(status: number, body: unknown): ApiError {
  if (typeof body === 'object' && body !== null) {
    const wrapper = (body as Record<string, unknown>)['error'];
    if (typeof wrapper === 'object' && wrapper !== null) {
      const record = wrapper as Record<string, unknown>;
      const code = typeof record['code'] === 'string' ? record['code'] : 'unknown_error';
      const message =
        typeof record['message'] === 'string' ? record['message'] : 'The request failed.';
      return new ApiError(status, code, message);
    }
  }
  return new ApiError(status, 'unknown_error', `The request failed (HTTP ${status}).`);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  // Required by the server on any unsafe method; harmless on GET. A
  // cross-origin page cannot set it, which is what makes it a CSRF defence.
  headers.set('X-Class-Meet', '1');
  if (init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers,
      // Same-origin in dev (via the Vite proxy) and in production, so the
      // session cookie rides along without any CORS involvement.
      credentials: 'same-origin',
    });
  } catch {
    // Network-level failure: server down, offline, DNS. `fetch` only rejects
    // here, never for a 4xx/5xx, so this branch really is "no reply".
    throw new ApiError(
      0,
      'network_error',
      'Could not reach the Class Meet server. Check that it is running and try again.',
    );
  }

  let body: unknown = null;
  const text = await response.text().catch(() => '');
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    throw extractError(response.status, body);
  }

  // An assertion, not a validation: the only producer of these responses is
  // our own server, and the response types here are declared to match its
  // handlers. If the API ever accepts third-party data, this is where a
  // schema check belongs.
  return body as T;
}

export const api = {
  /** Exchanges a Microsoft access token for a Class Meet session cookie. */
  signInWithEntra: (accessToken: string): Promise<SessionResponse> =>
    request<SessionResponse>('/api/auth/entra', {
      method: 'POST',
      body: JSON.stringify({ accessToken }),
    }),

  /** Resolves with the signed-in user, or throws ApiError 401. */
  fetchMe: (): Promise<SessionResponse> => request<SessionResponse>('/api/auth/me'),

  logout: (): Promise<{ ok: boolean }> =>
    request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  fetchAuthConfig: (): Promise<AuthConfigResponse> =>
    request<AuthConfigResponse>('/api/auth/config'),

  /**
   * DEVELOPMENT SIGN-IN BYPASS — REMOVE BEFORE THE PILOT. No body: the fake
   * identity is a server-side constant, not something a caller can choose.
   */
  devLogin: (): Promise<SessionResponse> =>
    request<SessionResponse>('/api/auth/dev-login', { method: 'POST' }),
};
