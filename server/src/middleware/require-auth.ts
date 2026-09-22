/**
 * Auth middleware for protected routes.
 *
 * It only reads the session cookie and validates the JWT — no database call.
 * That keeps it cheap, and it means a signed-out request is answered with 401
 * even when the database is unreachable. Handlers that need the full user
 * profile load it themselves.
 */
import type { NextFunction, Request, Response } from 'express';
import { SESSION_COOKIE_NAME, readSessionToken, type SessionClaims } from '../session.js';
import { HttpError } from '../errors.js';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by `requireAuth`. Undefined on unauthenticated routes. */
    session?: SessionClaims;
  }
}

/** Reads the session without rejecting. Useful for routes that adapt to it. */
export function readSession(req: Request): SessionClaims | null {
  const cookies: unknown = req.cookies;
  if (typeof cookies !== 'object' || cookies === null) return null;
  const raw = (cookies as Record<string, unknown>)[SESSION_COOKIE_NAME];
  return readSessionToken(typeof raw === 'string' ? raw : undefined);
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const session = readSession(req);
  if (session === null) {
    next(HttpError.unauthorized('not_authenticated', 'You are not signed in.'));
    return;
  }
  req.session = session;
  next();
}
