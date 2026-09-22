/**
 * CSRF protection for state-changing requests.
 *
 * The session cookie is SameSite=Lax, which already stops a cross-site form
 * from POSTing with the user's cookie attached. OWASP's cheat sheet is
 * explicit, though, that SameSite is defence in depth rather than a complete
 * defence, and recommends a custom request header for API endpoints: a custom
 * header cannot be set by a cross-origin <form> at all, and when set by
 * fetch/XHR it forces a CORS preflight that our server does not grant to
 * unknown origins.
 *
 * So every unsafe method must carry `X-Class-Meet: 1`. On top of that, when a
 * browser does send `Origin` (it always does for fetch), it must be one we
 * recognise. Both are stateless — no token to store or rotate, which matters
 * for a team that has to be able to read its own code.
 */
import type { NextFunction, Request, Response } from 'express';
import { env } from '../env.js';
import { HttpError } from '../errors.js';

export const CSRF_HEADER = 'x-class-meet';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function requireSameOriginRequest(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  if (req.get(CSRF_HEADER) === undefined) {
    next(
      HttpError.forbidden(
        'csrf_header_missing',
        `This request is missing the ${CSRF_HEADER} header required for write operations.`,
      ),
    );
    return;
  }

  const origin = req.get('origin');
  if (origin !== undefined && !env.clientOrigins.includes(origin.replace(/\/$/, ''))) {
    next(
      HttpError.forbidden(
        'origin_not_allowed',
        `Requests from ${origin} are not allowed. Add it to CLIENT_ORIGIN in server/.env if this is expected.`,
      ),
    );
    return;
  }

  next();
}
