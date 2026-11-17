/**
 * Auth middleware for protected routes.
 *
 * It only reads the session cookie and validates the JWT — no database call.
 * That keeps it cheap, and it means a signed-out request is answered with 401
 * even when the database is unreachable. Handlers that need the full user
 * profile load it themselves.
 */
import type { NextFunction, Request, Response } from 'express';
import { SESSION_COOKIE_NAME, clearSessionCookie, readSessionToken, type SessionClaims } from '../session.js';
import { HttpError } from '../errors.js';
import { env } from '../env.js';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by `requireAuth`. Undefined on unauthenticated routes. */
    session?: SessionClaims;
  }
}

/** The signed-in session from the cookie, or null when it is missing or invalid. */
function readSession(req: Request): SessionClaims | null {
  const cookies: unknown = req.cookies;
  if (typeof cookies !== 'object' || cookies === null) return null;
  const raw = (cookies as Record<string, unknown>)[SESSION_COOKIE_NAME];
  return readSessionToken(typeof raw === 'string' ? raw : undefined);
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const session = readSession(req);
  if (session === null) {
    next(HttpError.unauthorized('not_authenticated', 'You are not signed in.'));
    return;
  }

  // DEVELOPMENT SIGN-IN BYPASS — REMOVE BEFORE THE PILOT. A dev session is
  // honoured only while the bypass is on. Checked here, for every protected
  // route, rather than in `/me` alone: a dev cookie signed with a secret that
  // later reached a deployment must not open the rest of the API there.
  if (session.dev === true && !env.allowDevLogin) {
    clearSessionCookie(res);
    next(
      HttpError.unauthorized(
        'dev_login_disabled',
        'That session came from the development sign-in bypass, which is switched off. ' +
          'Sign in with your UTA email.',
      ),
    );
    return;
  }

  req.session = session;
  next();
}
