/**
 * Session management.
 *
 * We do NOT keep Microsoft's access token as the session. It is a credential
 * for a single moment of authentication: it is short-lived (Microsoft assigns
 * it a random 60-90 minute lifetime), refreshing it is MSAL's job in the
 * browser and not ours, and its claims are for the API to read once rather
 * than to carry around. Microsoft's own framing is that an access token is
 * proof of authorization for one call.
 *
 * So: after verification we mint our own signed JWT and put it in a cookie
 * that JavaScript cannot read.
 *
 *   httpOnly  — the token is invisible to `document.cookie`, so an XSS bug
 *               cannot exfiltrate it (which is exactly what localStorage
 *               cannot promise).
 *   sameSite  — 'lax': the browser will not attach the cookie to
 *               cross-site POST/PUT/DELETE, which removes the classic CSRF
 *               vector. OWASP is clear that SameSite is defence in depth and
 *               not a complete CSRF defence on its own, so state-changing
 *               routes additionally require a custom header and a matching
 *               Origin — see `src/middleware/csrf.ts`.
 *   secure    — on in production, so the cookie is never sent over plain HTTP.
 *               Off in development because local dev is http://localhost.
 *   path      — '/' so both /api and any future route sees it.
 *
 * Expiry: the JWT `exp` and the cookie `maxAge` are set from the same value,
 * so a cookie the browser still holds is never a session the server accepts.
 * There is no refresh token: when the session expires the user presses the
 * sign-in button again, which — because the browser still has a live
 * Microsoft session — is usually a single click with no password prompt.
 */
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Response } from 'express';
import { env } from './env.js';

export const SESSION_COOKIE_NAME = 'cm_session';

const ISSUER = 'class-meet';
const AUDIENCE = 'class-meet-client';

export interface SessionClaims {
  /** `users.id` — our own primary key, not the directory's. */
  userId: string;
  /** Entra's `oid`, kept so we can audit which account a session belongs to. */
  providerObjectId: string;
  /**
   * DEVELOPMENT SIGN-IN BYPASS — REMOVE BEFORE THE PILOT.
   * Marks a session minted by `POST /api/auth/dev-login`, so `GET /me` knows
   * to answer from the hard-coded dev user instead of querying a database
   * that may not exist. Absent on every real session.
   */
  dev?: true;
}

interface SessionTokenPayload extends SessionClaims {
  /** DEVELOPMENT SIGN-IN BYPASS — REMOVE BEFORE THE PILOT. */
  dev?: true;
  iss?: string;
  aud?: string;
  sub?: string;
  exp?: number;
  iat?: number;
}

function ttlSeconds(): number {
  return env.sessionTtlDays * 24 * 60 * 60;
}

export function createSessionToken(claims: SessionClaims): string {
  const options: SignOptions = {
    algorithm: 'HS256',
    expiresIn: ttlSeconds(),
    issuer: ISSUER,
    audience: AUDIENCE,
    subject: claims.userId,
  };
  return jwt.sign(
    {
      userId: claims.userId,
      providerObjectId: claims.providerObjectId,
      // DEVELOPMENT SIGN-IN BYPASS — REMOVE BEFORE THE PILOT.
      ...(claims.dev === true ? { dev: true as const } : {}),
    },
    env.sessionSecret,
    options,
  );
}

/** Returns the claims, or null for any token that is missing, expired, tampered with, or malformed. */
export function readSessionToken(token: string | undefined): SessionClaims | null {
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, env.sessionSecret, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    if (typeof decoded === 'string') return null;

    const payload = decoded as SessionTokenPayload;
    if (typeof payload.userId !== 'string' || typeof payload.providerObjectId !== 'string') {
      return null;
    }
    return {
      userId: payload.userId,
      providerObjectId: payload.providerObjectId,
      // DEVELOPMENT SIGN-IN BYPASS — REMOVE BEFORE THE PILOT. Read back only
      // as the literal `true`, so a tampered value cannot become truthy.
      ...(payload.dev === true ? { dev: true as const } : {}),
    };
  } catch {
    // Expired or invalid. Not an error worth logging on every request.
    return null;
  }
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: ttlSeconds() * 1000,
  });
}

export function clearSessionCookie(res: Response): void {
  // The attributes must match the ones used when setting it, or the browser
  // treats it as a different cookie and leaves the original in place.
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    path: '/',
  });
}
