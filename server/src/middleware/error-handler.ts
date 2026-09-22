import type { NextFunction, Request, Response } from 'express';
import { isHttpError } from '../errors.js';

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'not_found', message: `No API route matches ${req.method} ${req.originalUrl}.` },
  } satisfies ApiErrorBody);
}

/**
 * Express 5 forwards rejected async handlers here automatically, so route
 * handlers do not need their own try/catch just to report a failure.
 */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

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
