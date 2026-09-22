/**
 * Feature F1 — university sign-in via Microsoft Entra ID.
 *
 *   POST /api/auth/entra    { accessToken } -> verify, authorise, upsert, set cookie
 *   GET  /api/auth/me                       -> current user, or 401
 *   POST /api/auth/logout                   -> clear cookie
 *   GET  /api/auth/config                   -> what the SPA needs to talk to Entra
 *
 *   POST /api/auth/dev-login  DEVELOPMENT SIGN-IN BYPASS — REMOVE BEFORE THE
 *                             PILOT. See `src/dev-login.ts`.
 */
import { Router, type Request, type Response } from 'express';
import { verifyEntraAccessToken, isEntraConfigured } from '../entra.js';
import { upsertUserFromDirectory, findUserById, type PublicUser } from '../users.js';
import { createSessionToken, setSessionCookie, clearSessionCookie } from '../session.js';
import { requireAuth } from '../middleware/require-auth.js';
import { HttpError } from '../errors.js';
import { env } from '../env.js';
// DEVELOPMENT SIGN-IN BYPASS — REMOVE BEFORE THE PILOT.
import { devUser, DEV_PROVIDER_OBJECT_ID } from '../dev-login.js';

export const authRouter = Router();

interface SessionResponse {
  user: PublicUser;
}

/**
 * The bearer token MSAL acquired for our own API scope, sent as JSON by our
 * own fetch call. It arrives in a request body rather than an `Authorization`
 * header because this endpoint is not a protected resource being called — it
 * is the one-time exchange of a Microsoft credential for a Class Meet session.
 */
function readAccessToken(body: unknown): string {
  if (typeof body !== 'object' || body === null) {
    throw HttpError.badRequest(
      'access_token_missing',
      'Expected a JSON body containing a Microsoft access token.',
    );
  }
  const accessToken = (body as Record<string, unknown>)['accessToken'];
  if (typeof accessToken !== 'string' || accessToken.trim().length === 0) {
    throw HttpError.badRequest(
      'access_token_missing',
      'No Microsoft access token was supplied. Please use the sign-in button.',
    );
  }
  return accessToken.trim();
}

authRouter.post('/entra', async (req: Request, res: Response) => {
  const accessToken = readAccessToken(req.body);

  // Throws 401 for an unverifiable token, 403 for a token from another tenant
  // or without our delegated scope, 503 if ENTRA_CLIENT_ID is unset.
  const identity = await verifyEntraAccessToken(accessToken);

  // Throws 503 if DATABASE_URL is unset or Neon is unreachable.
  const user = await upsertUserFromDirectory({
    providerTenantId: identity.tenantId,
    providerObjectId: identity.objectId,
    email: identity.email,
    name: identity.name,
  });

  setSessionCookie(
    res,
    createSessionToken({ userId: user.id, providerObjectId: identity.objectId }),
  );
  res.status(200).json({ user } satisfies SessionResponse);
});

authRouter.get('/me', requireAuth, async (req: Request, res: Response) => {
  const session = req.session;
  if (session === undefined) {
    // Unreachable: requireAuth either sets it or rejects. Guard for the type.
    throw HttpError.unauthorized('not_authenticated', 'You are not signed in.');
  }

  // DEVELOPMENT SIGN-IN BYPASS — REMOVE BEFORE THE PILOT. A dev session is
  // answered from the hard-coded user, because the whole point of it is to
  // work with no DATABASE_URL. The flag is re-checked here and not merely
  // trusted from the cookie, so turning the gate off invalidates the sessions
  // it handed out.
  if (session.dev === true) {
    if (!env.allowDevLogin) {
      clearSessionCookie(res);
      throw HttpError.unauthorized(
        'dev_login_disabled',
        'That session came from the development sign-in bypass, which is now switched off. ' +
          'Sign in with your UTA account.',
      );
    }
    res.status(200).json({ user: devUser() } satisfies SessionResponse);
    return;
  }

  const user = await findUserById(session.userId);
  if (user === null) {
    // The session is valid but the row is gone (database reset, user deleted).
    // Treat it as signed out and clean up the stale cookie.
    clearSessionCookie(res);
    throw HttpError.unauthorized('session_user_missing', 'Your session is no longer valid. Please sign in again.');
  }

  res.status(200).json({ user } satisfies SessionResponse);
});

authRouter.post('/logout', (_req: Request, res: Response) => {
  clearSessionCookie(res);
  res.status(200).json({ ok: true });
});

/**
 * Everything the SPA needs in order to ask Microsoft for a token, served from
 * the one process that also *validates* those tokens. Keeping the authority
 * and the scope here means the browser cannot drift out of step with what the
 * server will accept, and the login page can say which organisation is allowed
 * in without hard-coding it a second time.
 *
 * All of it is public information: a client ID and a tenant ID are designed to
 * be, and the server is what decides whether a token is acceptable.
 */
authRouter.get('/config', (_req: Request, res: Response) => {
  res.status(200).json({
    configured: isEntraConfigured(),
    clientId: env.entraClientId,
    tenantId: env.utaTenantId,
    tenantDisplayName: env.tenantDisplayName,
    // Blank rather than the nonsense `api:///access_as_user` when the client
    // ID is still unset, so a half-configured server cannot hand the SPA a
    // scope that Microsoft would reject with a confusing error.
    apiScope: isEntraConfigured() ? env.apiScope : '',
    // DEVELOPMENT SIGN-IN BYPASS — REMOVE BEFORE THE PILOT. The login page
    // shows its button only if this is true, so the button and the endpoint
    // can never disagree.
    devLoginEnabled: env.allowDevLogin,
  });
});

/**
 * DEVELOPMENT SIGN-IN BYPASS — REMOVE BEFORE THE PILOT. See `src/dev-login.ts`
 * for what gates it and why it is safe to have existed at all.
 *
 * It takes no request body on purpose: the identity is a server-side constant,
 * so this cannot be used to sign in as an arbitrary person. It touches no
 * database, so it works before the Neon project exists — which is the only
 * reason it exists.
 *
 * It sits on the same router as the real sign-in, so it inherits the CSRF
 * header and Origin checks in `src/middleware/csrf.ts` unchanged.
 */
authRouter.post('/dev-login', (_req: Request, res: Response) => {
  if (!env.allowDevLogin) {
    throw HttpError.forbidden(
      'dev_login_disabled',
      'The development sign-in bypass is disabled. It requires ALLOW_DEV_LOGIN=true in ' +
        'server/.env and a non-production NODE_ENV.',
    );
  }

  const user = devUser();
  console.warn('[auth] DEV LOGIN: issued a session for the fake user %s', user.email);

  setSessionCookie(
    res,
    createSessionToken({
      userId: user.id,
      providerObjectId: DEV_PROVIDER_OBJECT_ID,
      dev: true,
    }),
  );
  res.status(200).json({ user } satisfies SessionResponse);
});
