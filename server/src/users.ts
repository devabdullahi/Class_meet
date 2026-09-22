/**
 * The `users` table: one row per directory account that has ever signed in.
 *
 * The account key is the pair (`provider_tenant_id`, `provider_object_id`) —
 * Entra's `tid` and `oid`. `oid` alone is not enough: Microsoft documents it as
 * unique *within* a tenant, and "if a single user exists in multiple tenants,
 * the user contains a different object ID in each tenant". Storing the tenant
 * with it means the key stays correct if Class Meet is ever opened to a second
 * university, and it makes the row self-describing about which directory it
 * came from. Both columns are provider-neutral names on purpose: the first
 * iteration of this schema said `google_sub` and had to be rewritten.
 *
 * The email is stored for display and for the course-roster features later. It
 * is never the key — Microsoft's guidance is explicit that human-readable
 * fields change and get reused, so "your application mustn't use human-readable
 * data to identify a user".
 */
import { query } from './db/pool.js';

/** Shape of a `users` row as Postgres returns it. */
interface UserRow {
  id: string;
  provider_tenant_id: string;
  provider_object_id: string;
  email: string;
  name: string;
  created_at: Date;
  last_login_at: Date;
}

/** The user object the API hands to the client. */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  lastLoginAt: string;
}

function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.created_at.toISOString(),
    lastLoginAt: row.last_login_at.toISOString(),
  };
}

export interface UpsertUserInput {
  providerTenantId: string;
  providerObjectId: string;
  email: string;
  name: string;
}

/**
 * Insert the user on first sign-in, or refresh their profile and
 * `last_login_at` on every sign-in after that.
 */
export async function upsertUserFromDirectory(input: UpsertUserInput): Promise<PublicUser> {
  const rows = await query<UserRow>(
    `INSERT INTO users (provider_tenant_id, provider_object_id, email, name, last_login_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (provider_tenant_id, provider_object_id) DO UPDATE
       SET email         = EXCLUDED.email,
           name          = EXCLUDED.name,
           last_login_at = now()
     RETURNING id, provider_tenant_id, provider_object_id, email, name, created_at, last_login_at`,
    [input.providerTenantId, input.providerObjectId, input.email, input.name],
  );

  const row = rows[0];
  if (row === undefined) {
    // Should be unreachable: RETURNING on an upsert always yields one row.
    throw new Error('upsertUserFromDirectory: INSERT ... RETURNING produced no row');
  }
  return toPublicUser(row);
}

export async function findUserById(id: string): Promise<PublicUser | null> {
  const rows = await query<UserRow>(
    `SELECT id, provider_tenant_id, provider_object_id, email, name, created_at, last_login_at
       FROM users
      WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  return row === undefined ? null : toPublicUser(row);
}
