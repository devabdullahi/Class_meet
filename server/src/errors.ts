/**
 * A single error type that carries an HTTP status and a message that is safe
 * to show the user. Anything else that reaches the error handler is treated
 * as an unexpected bug: logged in full, reported as a generic 500.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  /**
   * Only on a 429: how long to wait. The error handler sends it as the
   * standard `Retry-After` header and in the body, where the sign-in page
   * reads it to count down to "Resend code".
   */
  readonly retryAfterSeconds: number | undefined;

  constructor(status: number, code: string, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  static badRequest(code: string, message: string): HttpError {
    return new HttpError(400, code, message);
  }

  static unauthorized(code: string, message: string): HttpError {
    return new HttpError(401, code, message);
  }

  static forbidden(code: string, message: string): HttpError {
    return new HttpError(403, code, message);
  }

  static conflict(code: string, message: string): HttpError {
    return new HttpError(409, code, message);
  }

  static notFound(code: string, message: string): HttpError {
    return new HttpError(404, code, message);
  }

  static tooManyRequests(code: string, message: string, retryAfterSeconds: number): HttpError {
    return new HttpError(429, code, message, Math.max(1, Math.ceil(retryAfterSeconds)));
  }

  static serviceUnavailable(code: string, message: string): HttpError {
    return new HttpError(503, code, message);
  }
}

export function isHttpError(value: unknown): value is HttpError {
  return value instanceof HttpError;
}
