/**
 * DEVELOPMENT SIGN-IN BYPASS — REMOVE BEFORE THE PILOT.
 *
 * Iteration-1 scaffolding. Registering the Entra app and creating the Neon
 * project are both blocked on things outside the code (an Azure tenant, a
 * database), and until they exist nobody can see past the login screen. This
 * lets the team work on everything after sign-in in the meantime.
 *
 * It is deliberately concentrated in one file so that deleting the feature is
 * deleting a file plus the four call sites that import it:
 *   - `src/env.ts`          reads the flag
 *   - `src/routes/auth.ts`  the endpoint, the `/me` short-circuit, the `/config` flag
 *   - `src/index.ts`        the startup warning
 *   - `client/src/pages/LoginPage.tsx`  the button
 *
 * WHAT MAKES IT NOT A HOLE:
 *
 *  - Two independent gates. `NODE_ENV` must not be `production` AND
 *    `ALLOW_DEV_LOGIN` must be exactly `true`. Unset is off.
 *  - If both `NODE_ENV=production` and the flag are set, the server refuses to
 *    boot (see `src/env.ts`). A deployment that fails loudly is a far better
 *    outcome than one that silently accepts unauthenticated sign-ins.
 *  - The endpoint takes no input. The identity below is hard-coded, so the
 *    endpoint cannot be used to become an arbitrary user — which is the
 *    difference between a dev shortcut and an impersonation API.
 *  - It writes nothing. The session is marked `dev` and `GET /api/auth/me`
 *    answers it from this constant, so no fake row ever reaches Postgres and
 *    the real sign-in path does not depend on any of this.
 */
import type { PublicUser } from './users.js';

/**
 * A plausible but obviously fake student. The UUID is fixed so a dev session
 * survives a server restart, it is all zeroes so it could never collide with
 * a `gen_random_uuid()` row, and the `dev.` prefix on the address is so nobody
 * mistakes a screenshot of this for a real account.
 */
const DEV_USER_ID = '00000000-0000-4000-8000-000000000000';
const DEV_USER_CREATED_AT = '2026-01-01T00:00:00.000Z';

export function devUser(): PublicUser {
  return {
    id: DEV_USER_ID,
    email: 'dev.student@mavs.uta.edu',
    name: 'Dev Student',
    createdAt: DEV_USER_CREATED_AT,
    lastLoginAt: new Date().toISOString(),
  };
}

/** The `oid` stand-in recorded in the session, for symmetry with a real one. */
export const DEV_PROVIDER_OBJECT_ID = 'dev-login-no-directory-account';
