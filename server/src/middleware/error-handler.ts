import type { NextFunction, Request, Response } from 'express';
import { HttpError, isHttpError } from '../errors.js';

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'not_found', message: `No API route matches ${req.method} ${req.originalUrl}.` },
  } satisfies ApiErrorBody);
}

/**
 * express.json() rejects a body it cannot accept with an error carrying a
 * `type`. Both cases are the client's mistake, not a bug of ours, so they get
 * a 4xx of their own instead of the generic 500.
 */
function bodyParserError(error: unknown): HttpError | null {
  const type = typeof error === 'object' && error !== null ? (error as { type?: unknown }).type : undefined;
  if (type === 'entity.parse.failed') {
    return HttpError.badRequest('invalid_json', 'The request body is not valid JSON.');
  }
  if (type === 'entity.too.large') {
    return new HttpError(413, 'payload_too_large', 'The request body is too large.');
  }
  return null;
}

/**
 * Express 5 forwards rejected async handlers here automatically, so route
 * handlers do not need their own try/catch just to report a failure.
 */
export function errorHandler(
  caught: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(caught);
    return;
  }

  const error = bodyParserError(caught) ?? caught;
  if (isHttpError(error)) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message },
    } satisfies ApiErrorBody);
    return;
  }

  // Anything here is a bug rather than an expected condition: log it in full,
  // tell the client nothing about our internals.
  console.error('[api] unhandled error:', error);
  res.status(500).json({
    error: { code: 'internal_error', message: 'Something went wrong on our end. Please try again.' },
  } satisfies ApiErrorBody);
}
