/**
 * A single error type that carries an HTTP status and a message that is safe
 * to show the user. Anything else that reaches the error handler is treated
 * as an unexpected bug: logged in full, reported as a generic 500.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
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

  static serviceUnavailable(code: string, message: string): HttpError {
    return new HttpError(503, code, message);
  }
}

export function isHttpError(value: unknown): value is HttpError {
  return value instanceof HttpError;
}
