/**
 * Verifying a Microsoft Entra ID access token, and deciding whether its owner
 * is allowed in.
 *
 * WHY AN ACCESS TOKEN AND NOT AN ID TOKEN. Microsoft's guidance here is the
 * opposite of Google's, and getting it backwards is the common mistake:
 *   - "You shouldn't use an ID token to call an API." (id-tokens)
 *   - "Web APIs must validate access tokens sent to them by a client. They
 *     must only accept tokens containing one of their AppId URIs as the `aud`
 *     claim." (access-tokens)
 * So the SPA acquires an access token for the scope this app publishes under
 * "Expose an API" (`api://<client-id>/access_as_user`), and that is what we
 * verify. The ID token stays in the browser where it belongs.
 *
 * WHY THE `tid` CLAIM IS THE ACCESS POLICY. The iteration-1 version of this
 * file matched the email address against a domain allowlist. That cannot work
 * here and should not: `@mavs.uta.edu` is a Microsoft identity, and Entra has
 * no `email_verified` claim to lean on — `email` and `preferred_username` are
 * documented as mutable and explicitly not for authorization decisions. What
 * Microsoft *does* sign is `tid`, the immutable tenant ID of the organisation
 * the user signed in to. "Always check that the `tid` in a token matches the
 * tenant ID used to store data with the application." (claims-validation)
 * A student cannot bring a `tid` of UTA's tenant without a UTA account, which
 * is a far stronger statement than "their email ends in uta.edu".
 *
 * WHAT WE CHECK, and why each one is needed:
 *   signature  — against UTA's tenant key set, so a token signed for any other
 *                tenant fails before a claim is read.
 *   iss        — exactly `https://login.microsoftonline.com/<tid>/v2.0`.
 *   aud        — our own client ID. Validating a token minted for someone else
 *                is the confused-deputy problem; Microsoft calls it out by name.
 *   exp / nbf  — handled by `jwtVerify`, with a small clock tolerance.
 *   tid        — the access policy (see above).
 *   scp        — the token must actually carry our delegated scope. Without
 *                this, any token for our `aud` would do.
 *   oid        — present, and used as the account key. Microsoft's own advice:
 *                "Your application mustn't use human-readable data to identify
 *                a user."
 *
 * Sources:
 *   https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens
 *   https://learn.microsoft.com/en-us/entra/identity-platform/id-tokens
 *   https://learn.microsoft.com/en-us/entra/identity-platform/claims-validation
 *   https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { env } from './env.js';
import { HttpError } from './errors.js';

export interface VerifiedEntraIdentity {
  /** `oid` — immutable per-tenant object ID. The account key. */
  objectId: string;
  /** `tid` — the tenant the user signed in to. Stored alongside `oid`. */
  tenantId: string;
  /** Display email. Best-effort: see `readEmail`. */
  email: string;
  name: string;
}

/**
 * One key set for the whole process. `createRemoteJWKSet` caches the keys and
 * refetches when it sees a `kid` it does not know, which is exactly the
 * behaviour Microsoft asks for: "Microsoft Entra ID rotates the possible set of
 * keys on a periodic basis, so write the application to handle those key
 * changes automatically."
 *
 * Built lazily so that a server with no ENTRA_CLIENT_ID still boots.
 */
let keySet: ReturnType<typeof createRemoteJWKSet> | null = null;

function getKeySet(): ReturnType<typeof createRemoteJWKSet> {
  if (keySet === null) {
    keySet = createRemoteJWKSet(new URL(env.entraJwksUri), {
      // Re-fetch at most this often when an unknown `kid` shows up, so a
      // stream of junk tokens cannot turn into a stream of requests to
      // Microsoft.
      cooldownDuration: 30_000,
      // Refresh the cached keys daily, the interval Microsoft suggests.
      cacheMaxAge: 24 * 60 * 60 * 1000,
    });
  }
  return keySet;
}

export function isEntraConfigured(): boolean {
  return env.entraClientId.length > 0;
}

/** The same message in the two places that need it. */
function notConfigured(): HttpError {
  return HttpError.serviceUnavailable(
    'entra_not_configured',
    'Microsoft sign-in is not configured on this server. Register the app in the Azure ' +
      'portal, then set ENTRA_CLIENT_ID in server/.env and restart.',
  );
}

const INVALID_TOKEN_MESSAGE =
  'That Microsoft sign-in could not be verified. Please try signing in again.';

/** Step 1: signature, issuer, audience and the standard time claims. */
async function verifySignatureAndStandardClaims(accessToken: string): Promise<JWTPayload> {
  if (!isEntraConfigured()) {
    throw notConfigured();
  }

  try {
    const { payload } = await jwtVerify(accessToken, getKeySet(), {
      issuer: env.entraIssuer,
      // Spread: `env` is `as const`, and jose wants a mutable array.
      audience: [...env.entraAudiences],
      // Entra signs with RS256. Pinning it stops a token from choosing a
      // weaker algorithm than the one we expect.
      algorithms: ['RS256'],
      // Enough slack for a laptop whose clock is a little off, not enough to
      // matter for a token that lives about an hour.
      clockTolerance: '60s',
    });
    return payload;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn('[auth] Entra access token verification failed:', detail);
    throw HttpError.unauthorized('invalid_entra_token', INVALID_TOKEN_MESSAGE);
  }
}

function readString(payload: JWTPayload, claim: string): string | null {
  const value = payload[claim];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Entra has no `email_verified`, and `email` is only present when the app
 * registration adds it as an optional claim or the `email` scope is requested.
 * `preferred_username` is the primary username and for a work or school
 * account is the UPN, which for UTA is the address the student recognises. So:
 * prefer `preferred_username`, fall back to `upn` and then `email`.
 *
 * Whatever we get is a display string only. It is never the account key and
 * never an authorization input — the docs say of both claims that the value is
 * mutable and "can't be used to make authorization decisions".
 */
function readEmail(payload: JWTPayload): string | null {
  const candidate =
    readString(payload, 'preferred_username') ??
    readString(payload, 'upn') ??
    readString(payload, 'email');
  return candidate === null ? null : candidate.toLowerCase();
}

/** Step 2: the checks and the policy that `jwtVerify` cannot know about. */
export function applyAccessPolicy(payload: JWTPayload): VerifiedEntraIdentity {
  // v2.0 is what a client configured against the v2.0 endpoint gets, and the
  // claim names below are the v2.0 ones. Refusing anything else means we never
  // silently misread a v1.0 token.
  const version = readString(payload, 'ver');
  if (version !== '2.0') {
    console.warn(`[auth] rejected Entra token with ver=${String(version)}`);
    throw HttpError.unauthorized('invalid_entra_token', INVALID_TOKEN_MESSAGE);
  }

  const tenantId = readString(payload, 'tid');
  if (tenantId === null) {
    throw HttpError.unauthorized('invalid_entra_token', INVALID_TOKEN_MESSAGE);
  }

  // THE ACCESS POLICY. Redundant with the tenant-scoped key set and the fixed
  // issuer above, deliberately: those two say "this token came from UTA's
  // tenant", and this says "and we only ever let UTA's tenant in". If someone
  // later repoints the JWKS or widens the authority, this line still holds.
  if (tenantId.toLowerCase() !== env.utaTenantId) {
    console.warn(`[auth] rejected sign-in from tenant ${tenantId}`);
    throw HttpError.forbidden(
      'tenant_not_allowed',
      `Class Meet is only open to ${env.tenantDisplayName} accounts. The account you signed ` +
        'in with belongs to a different organisation. Sign in again with your UTA account ' +
        '(the one ending in @mavs.uta.edu or @uta.edu).',
    );
  }

  // A delegated scope is granted per user, so its presence also tells us this
  // is a user token rather than an app-only one. The claims-validation doc
  // warns that checking the tenant alone "could inadvertently authorize all
  // service principals in that tenant in addition to users".
  const grantedScopes = (readString(payload, 'scp') ?? '').split(' ').filter((s) => s.length > 0);
  if (!grantedScopes.includes(env.apiScopeName)) {
    console.warn(`[auth] rejected Entra token without the ${env.apiScopeName} scope`);
    throw HttpError.forbidden(
      'scope_missing',
      `That sign-in did not include permission to use the Class Meet API (${env.apiScopeName}). ` +
        'Check that the scope is published under "Expose an API" on the app registration.',
    );
  }

  const objectId = readString(payload, 'oid');
  if (objectId === null) {
    // No `oid` means either an app-only token or a malformed one. Either way we
    // have no stable identifier and must not invent one from the email.
    throw HttpError.forbidden(
      'object_id_missing',
      'That sign-in did not identify a user account. Sign in with your own UTA account ' +
        'rather than a service principal.',
    );
  }

  const email = readEmail(payload);
  if (email === null) {
    throw HttpError.forbidden(
      'email_missing',
      'Class Meet needs your university email address, and Microsoft did not include one in ' +
        'the sign-in. Add `email` as an optional claim on the app registration and try again.',
    );
  }

  const atIndex = email.lastIndexOf('@');
  const name = readString(payload, 'name') ?? email.slice(0, atIndex === -1 ? undefined : atIndex);

  return { objectId, tenantId: tenantId.toLowerCase(), email, name };
}

export async function verifyEntraAccessToken(accessToken: string): Promise<VerifiedEntraIdentity> {
  const payload = await verifySignatureAndStandardClaims(accessToken);
  return applyAccessPolicy(payload);
}
