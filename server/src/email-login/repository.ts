/**
 * All SQL for email sign-in: the one-time codes, and finding or creating the
 * account a verified address belongs to. The router depends on the
 * `EmailLoginRepository` interface, not on Postgres, as it does for groups.
 *
 * The rules that must hold even under concurrent requests are enforced by
 * single statements here rather than by read-then-write in the router:
 *  - one code per address and one per minute: an upsert whose UPDATE only
 *    applies when the existing code is old enough;
 *  - five guesses per code: the guess is counted in the same UPDATE that
 *    reads the hash back, and only while fewer than five have been counted;
 *  - single use: a correct code is deleted, and only the request whose
 *    DELETE removed the row may sign in.
 * Times come from the database's clock, so expiry does not depend on which
 * server process handled the request.
 */
import { poolDatabase, type Database } from '../db/pool.js';
import { toPublicUser, type PublicUser, type UserRow } from '../users.js';

export interface CodeTimings {
  /** How long a code works for. */
  ttlSeconds: number;
  /** How long before another code may be sent to the same address. */
  resendCooldownSeconds: number;
}

export type IssueCodeOutcome =
  | { outcome: 'issued' }
  | { outcome: 'too_soon'; retryAfterSeconds: number };

/** A guess has been counted against the address's code; this is the code to check it with. */
export interface CountedAttempt {
  codeHash: string;
  /** Guesses counted so far, this one included. */
  attempts: number;
}

/** The provider values that mark an account created by email sign-in (see migration 008). */
export const EMAIL_PROVIDER_TENANT_ID = 'email';

export interface EmailLoginRepository {
  /** Stores a new code for the address, replacing any old one — unless the old one is too recent. */
  issueCode(email: string, codeHash: string, timings: CodeTimings): Promise<IssueCodeOutcome>;
  /**
   * Counts one guess against the address's live code and returns its hash, or
   * null when there is no code that may still be guessed: none sent, expired,
   * or `maxAttempts` already used.
   */
  countAttempt(email: string, maxAttempts: number): Promise<CountedAttempt | null>;
  /** Deletes this exact code. True only for the one caller whose delete removed it. */
  deleteCode(email: string, codeHash: string): Promise<boolean>;
  deleteExpiredCodes(): Promise<void>;
  /**
   * The account with this address, or a new one. An address that already
   * belongs to an account — including one created by Microsoft sign-in — signs
   * in to that account.
   */
  findOrCreateUserByEmail(email: string, nameForNewAccount: string): Promise<PublicUser>;
}

export function createPostgresEmailLoginRepository(database: Database): EmailLoginRepository {
  const { query } = database;

  return {
    async issueCode(email, codeHash, { ttlSeconds, resendCooldownSeconds }) {
      const issued = await query<{ email: string }>(
        `INSERT INTO email_login_codes (email, code_hash, expires_at, attempts, created_at)
         VALUES ($1, $2, now() + $3::int * interval '1 second', 0, now())
         ON CONFLICT (email) DO UPDATE
           SET code_hash  = EXCLUDED.code_hash,
               expires_at = EXCLUDED.expires_at,
               attempts   = 0,
               created_at = EXCLUDED.created_at
           WHERE email_login_codes.created_at <= now() - $4::int * interval '1 second'
         RETURNING email`,
        [email, codeHash, ttlSeconds, resendCooldownSeconds],
      );
      if (issued.length > 0) return { outcome: 'issued' };

      const [wait] = await query<{ seconds: number }>(
        `SELECT ceil(extract(epoch FROM created_at + $2::int * interval '1 second' - now()))::int AS seconds
           FROM email_login_codes
          WHERE email = $1`,
        [email, resendCooldownSeconds],
      );
      return { outcome: 'too_soon', retryAfterSeconds: Math.max(1, wait?.seconds ?? 1) };
    },

    async countAttempt(email, maxAttempts) {
      const [row] = await query<{ code_hash: string; attempts: number }>(
        `UPDATE email_login_codes
            SET attempts = attempts + 1
          WHERE email = $1
            AND expires_at > now()
            AND attempts < $2
          RETURNING code_hash, attempts`,
        [email, maxAttempts],
      );
      return row === undefined ? null : { codeHash: row.code_hash, attempts: row.attempts };
    },

    async deleteCode(email, codeHash) {
      const deleted = await query<{ email: string }>(
        'DELETE FROM email_login_codes WHERE email = $1 AND code_hash = $2 RETURNING email',
        [email, codeHash],
      );
      return deleted.length > 0;
    },

    async deleteExpiredCodes() {
      await query('DELETE FROM email_login_codes WHERE expires_at <= now()');
    },

    async findOrCreateUserByEmail(email, nameForNewAccount) {
      // On a match only last_login_at changes: an existing account keeps its
      // name and its provider identifiers, Microsoft ones included.
      const [row] = await query<UserRow>(
        `INSERT INTO users (provider_tenant_id, provider_object_id, email, name, last_login_at)
         VALUES ($1, $2, $2, $3, now())
         ON CONFLICT (email) DO UPDATE SET last_login_at = now()
         RETURNING id, provider_tenant_id, provider_object_id, email, name, created_at, last_login_at`,
        [EMAIL_PROVIDER_TENANT_ID, email, nameForNewAccount],
      );
      if (row === undefined) {
        // Unreachable: an upsert with RETURNING always yields its row.
        throw new Error('findOrCreateUserByEmail: INSERT ... RETURNING produced no row');
      }
      return toPublicUser(row);
    },
  };
}

export const postgresEmailLoginRepository = createPostgresEmailLoginRepository(poolDatabase);
