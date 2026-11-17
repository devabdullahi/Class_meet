/**
 * Feature F1 — university sign-in. Students sign in with a code emailed to
 * their UTA address (`routes/email-login.ts`, mounted at /api/auth/email).
 * Microsoft Entra ID sign-in is kept, off unless ENABLE_MICROSOFT_LOGIN=true.
 *
 *   POST /api/auth/entra    { accessToken } -> verify, authorise, upsert, set cookie
 *   GET  /api/auth/me                       -> current user, or 401
 *   POST /api/auth/logout                   -> clear cookie
 *   GET  /api/auth/config                   -> which sign-in methods are on, and
 *                                              what the SPA needs to use them
 *
 *   POST /api/auth/dev-login  DEVELOPMENT SIGN-IN BYPASS — REMOVE BEFORE THE
 *                             PILOT. See `src/dev-login.ts`.
 */
import { Router, type Request, type Response } from 'express';
import { verifyEntraAccessToken, isEntraConfigured, isMicrosoftLoginEnabled } from '../entra.js';
import { upsertUserFromDirectory, findUserById, ensureDevUserRow, type PublicUser } from '../users.js';
import { isDatabaseConfigured } from '../db/pool.js';
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
  if (!isMicrosoftLoginEnabled()) {
    throw HttpError.forbidden(
      'microsoft_login_disabled',
      'Microsoft sign-in is turned off. Sign in with the code we email to your UTA address instead.',
    );
  }
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
  // work with no DATABASE_URL. requireAuth has already refused it if the
  // bypass is now off.
  if (session.dev === true) {
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
 * Everything the login page needs: which sign-in methods are on, and, for
 * Microsoft, how to ask it for a token — served from the one process that
 * also *validates* those tokens. Keeping the authority
 * and the scope here means the browser cannot drift out of step with what the
 * server will accept, and the login page can say which organisation is allowed
 * in without hard-coding it a second time.
 *
 * All of it is public information: a client ID and a tenant ID are designed to
 * be, and the server is what decides whether a token is acceptable.
 */
authRouter.get('/config', (_req: Request, res: Response) => {
  res.status(200).json({
    // Which addresses may ask for a code, so the login page can check what
    // was typed before a round trip, with the same list the server enforces.
    emailDomains: env.emailLoginDomains,
    // The login page offers Microsoft sign-in, and loads MSAL, only when true.
    microsoftLoginEnabled: isMicrosoftLoginEnabled(),
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
authRouter.post('/dev-login', async (_req: Request, res: Response) => {
  if (!env.allowDevLogin) {
    throw HttpError.forbidden(
      'dev_login_disabled',
      'The development sign-in bypass is disabled. It requires ALLOW_DEV_LOGIN=true in ' +
        'server/.env and a non-production NODE_ENV.',
    );
  }

  const user = devUser();

  // With a database configured, the dev student gets a real row so that
  // courses, groups and join requests can be stored for them. Without one the
  // sign-in still works, so the team can see the UI before Neon exists.
  if (isDatabaseConfigured()) {
    try {
      await ensureDevUserRow(user);
    } catch (error) {
      console.warn('[auth] DEV LOGIN: could not create the dev user row:', error instanceof Error ? error.message : error);
    }
  }

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
