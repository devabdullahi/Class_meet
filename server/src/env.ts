/**
 * Environment configuration.
 *
 * Everything the server needs is read and validated here, once, at startup.
 * Two deliberate rules:
 *
 *  1. Config that the server cannot run at all without (SESSION_SECRET, and
 *     in production an email provider) is validated eagerly and aborts startup.
 *  2. ENTRA_CLIENT_ID and DATABASE_URL are NOT required to boot. Whoever
 *     creates the Neon project may not have done it yet, and the server
 *     should still start and serve `GET /api/auth/me` (401) so the front end
 *     can be developed. Routes that genuinely need them report a clear 503
 *     instead of crashing. See `src/entra.ts` and `src/db/pool.ts`.
 */
import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DEFAULT_EMAIL_LOGIN_DOMAINS, parseEmailLoginDomains } from './email-login/email-address.js';
import { EMAIL_DELIVERY_HELP, readEmailDelivery } from './email-login/email-delivery-config.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadDotenv({ path: path.join(serverRoot, '.env'), quiet: true });

/**
 * UT Arlington's Microsoft Entra ID tenant. Confirmed by fetching
 * `https://login.microsoftonline.com/uta.edu/v2.0/.well-known/openid-configuration`
 * and the same document for `mavs.uta.edu`: both resolve to this one tenant,
 * whose issuer is `https://login.microsoftonline.com/<this guid>/v2.0`.
 *
 * Defaulted rather than left blank so nobody has to rediscover it, but still
 * overridable so the app can be pointed at a throwaway tenant for testing
 * without editing code.
 */
const UTA_TENANT_ID_DEFAULT = '5cdc5b43-d7be-4caa-8173-729e3b0a62d9';

/** Name of the scope published under "Expose an API" on the app registration. */
const API_SCOPE_NAME_DEFAULT = 'access_as_user';

/** Display name for the tenant above, used in sign-in copy and 403 messages. */
const TENANT_DISPLAY_NAME = 'The University of Texas at Arlington';

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Copy server/.env.example to server/.env and fill it in.`,
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

function intOption(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer, got "${raw}".`);
  }
  return parsed;
}

/**
 * A GUID, lowercased. Empty is allowed only where the caller passes an empty
 * fallback, which is how ENTRA_CLIENT_ID stays optional at boot: a *wrong*
 * value still fails loudly at startup, because a typo there would otherwise
 * surface much later as an unexplained 401 on every sign-in.
 */
function guidOption(name: string, fallback: string): string {
  const value = optional(name, fallback).toLowerCase();
  if (value.length > 0 && !GUID_PATTERN.test(value)) {
    throw new Error(
      `Environment variable ${name} must be a GUID as shown in the Azure portal, got "${value}".`,
    );
  }
  return value;
}

const nodeEnv = optional('NODE_ENV', 'development');
const sessionSecret = required('SESSION_SECRET');

if (sessionSecret.length < 32) {
  throw new Error(
    'SESSION_SECRET must be at least 32 characters. Generate one with:\n' +
      '  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
  );
}

const entraClientId = guidOption('ENTRA_CLIENT_ID', '');
const utaTenantId = guidOption('UTA_TENANT_ID', UTA_TENANT_ID_DEFAULT);
const apiScopeName = optional('ENTRA_API_SCOPE', API_SCOPE_NAME_DEFAULT);

/**
 * DEVELOPMENT SIGN-IN BYPASS — REMOVE BEFORE THE PILOT. See `src/dev-login.ts`.
 *
 * Two gates, and the combination that must never ship is a startup failure
 * rather than a warning: a deployed app that quietly accepts unauthenticated
 * sign-ins is the worst possible outcome, and refusing to boot is the only
 * response nobody can miss.
 */
const devLoginRequested = optional('ALLOW_DEV_LOGIN', '').toLowerCase() === 'true';

if (devLoginRequested && nodeEnv === 'production') {
  throw new Error(
    'ALLOW_DEV_LOGIN=true with NODE_ENV=production. The development sign-in bypass lets anyone ' +
      'in without credentials and must never run in production. Remove ALLOW_DEV_LOGIN from the ' +
      'environment (and delete server/src/dev-login.ts, which is iteration-1 scaffolding).',
  );
}

const allowDevLogin = devLoginRequested && nodeEnv !== 'production';

/** Who may sign in with an emailed code. See `src/email-login/email-address.ts`. */
const emailLoginDomains = parseEmailLoginDomains(
  optional('EMAIL_LOGIN_DOMAINS', DEFAULT_EMAIL_LOGIN_DOMAINS.join(',')),
);

/**
 * How sign-in codes are emailed: Brevo's API or SMTP (see
 * `src/email-login/email-delivery-config.ts`). Unlike ENTRA_CLIENT_ID and
 * DATABASE_URL, production refuses to boot without one rather than answering
 * 503: an emailed code is the only way into a deployed Class Meet, so a
 * production server without a provider could not let a single student in,
 * and the development fallback (printing codes to the console) must never be
 * what runs instead. A failed deploy keeps the previous one serving.
 */
const emailDelivery = readEmailDelivery(process.env);

if (emailDelivery === null && nodeEnv === 'production') {
  throw new Error(
    `NODE_ENV=production without an email provider. Sign-in works by emailing a code. ${EMAIL_DELIVERY_HELP}`,
  );
}

/**
 * Microsoft sign-in is kept but off unless asked for: UTA's tenant requires an
 * administrator to approve the app, so students cannot use it until someone
 * at UTA grants that. ENTRA_CLIENT_ID alone no longer turns it on.
 *
 * BEFORE TURNING IT ON: Microsoft sign-in finds accounts by their Microsoft
 * identifiers only (`upsertUserFromDirectory` in users.ts). A student who
 * first signed in with an emailed code has no such identifiers, so their
 * first Microsoft sign-in would try to create a second account with the same
 * address and fail with `duplicate_record`. Make that
 * upsert link an existing account by email first.
 */
const microsoftLoginRequested = optional('ENABLE_MICROSOFT_LOGIN', '').toLowerCase() === 'true';

const clientOrigins = optional('CLIENT_ORIGIN', 'http://localhost:5173')
  .split(',')
  .map((part) => part.trim().replace(/\/$/, ''))
  .filter((part) => part.length > 0);

export const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: intOption('PORT', 4000),

  /** Application (client) ID of the Entra app registration. Empty until set. */
  entraClientId,

  /** ENABLE_MICROSOFT_LOGIN=true. Microsoft sign-in also needs `entraClientId`; see `src/entra.ts`. */
  microsoftLoginRequested,

  /** Domains whose addresses may sign in with an emailed code, e.g. `mavs.uta.edu`. */
  emailLoginDomains,

  /** How sign-in codes are emailed, or null in development without a provider. */
  emailDelivery,

  /**
   * The most sign-in emails sent per hour and per day, across everyone.
   * Defaults sit below Brevo's free plan (300 a day), so a flood of requests
   * for many different addresses is stopped by us, politely, before the
   * provider stops every sign-in for the rest of the day.
   */
  emailSendsPerHour: intOption('EMAIL_SENDS_PER_HOUR', 60),
  emailSendsPerDay: intOption('EMAIL_SENDS_PER_DAY', 250),

  /**
   * The only tenant whose users may sign in. Enforced on the `tid` claim of a
   * token Microsoft signed — see `src/entra.ts`.
   */
  utaTenantId,
  tenantDisplayName: TENANT_DISPLAY_NAME,

  /**
   * Issuer required on incoming tokens. Microsoft's validation guidance is
   * that `iss` must be `https://login.microsoftonline.com/{tid}/v2.0` with
   * `{tid}` the exact `tid` claim — that is what ties the tenant back to the
   * issuer and to the scope of the signing key.
   */
  entraIssuer: `https://login.microsoftonline.com/${utaTenantId}/v2.0`,

  /**
   * Tenant-scoped key set, not the tenant-independent `/common` one. A token
   * signed for any other tenant then fails at the signature step, before a
   * single claim is read.
   */
  entraJwksUri: `https://login.microsoftonline.com/${utaTenantId}/discovery/v2.0/keys`,

  /**
   * Accepted `aud` values. A v2.0 access token for an API whose Application ID
   * URI is `api://<client-id>` carries the bare client ID, but the URI form is
   * accepted too so that setting a custom App ID URI does not break sign-in.
   */
  entraAudiences: [entraClientId, `api://${entraClientId}`],

  /** The delegated scope the access token must actually have been granted. */
  apiScopeName,
  /** What the SPA asks MSAL for. Served to the client by GET /api/auth/config. */
  apiScope: `api://${entraClientId}/${apiScopeName}`,

  sessionSecret,
  sessionTtlDays: intOption('SESSION_TTL_DAYS', 7),

  /** DEVELOPMENT SIGN-IN BYPASS — REMOVE BEFORE THE PILOT. */
  allowDevLogin,

  clientOrigins,

  /** Pooled connection string, used by the running API. May be empty. */
  databaseUrl: optional('DATABASE_URL', ''),
  /** Direct/unpooled connection string, preferred for migrations. May be empty. */
  directDatabaseUrl: optional('DIRECT_DATABASE_URL', ''),
} as const;
