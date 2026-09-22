/**
 * Postgres access.
 *
 * We use node-postgres (`pg`) with a `Pool`. Neon documents `pg` as a
 * supported client, and a Pool is the right shape for a long-running Express
 * process: connections are reused instead of opened per query.
 *
 * Connection strings — Neon gives you two:
 *   - POOLED   (hostname contains "-pooler")  -> use it here, for the API.
 *   - DIRECT   (no "-pooler")                 -> use it for migrations/DDL,
 *                                                which transaction pooling
 *                                                does not fully support.
 *
 * SSL: Neon requires TLS. Rather than depending on how a given `pg` release
 * interprets `sslmode=` inside the URL, we set `ssl` explicitly and keep
 * certificate verification ON for remote hosts. Localhost gets no TLS so a
 * plain local Postgres still works if someone sets one up later.
 *
 * Missing DATABASE_URL is a first-class, deliberate state: `getPool()` throws
 * an `HttpError` 503 with an actionable message, which the route error handler
 * turns into a clean JSON response. The server never crashes over it.
 */
import { Pool, type PoolConfig, type QueryResultRow } from 'pg';
import { env } from '../env.js';
import { HttpError } from '../errors.js';

let pool: Pool | null = null;

interface ParsedConnection {
  /** The URL with TLS query parameters removed. */
  connectionString: string;
  isLocal: boolean;
}

/**
 * Neon's console hands you a URL ending in `?sslmode=require&channel_binding=require`.
 * We strip those and set `ssl` in code instead, for two reasons: `pg` warns
 * that it currently treats `sslmode=require` as the stricter `verify-full` and
 * intends to change that in a future major version, and having TLS decided in
 * one place beats having it decided by whichever string someone pasted.
 */
function parseConnection(raw: string): ParsedConnection {
  try {
    const url = new URL(raw);
    url.searchParams.delete('sslmode');
    url.searchParams.delete('channel_binding');
    return {
      connectionString: url.toString(),
      isLocal: url.hostname === 'localhost' || url.hostname === '127.0.0.1',
    };
  } catch {
    // Not a parseable URL. Hand it to pg unchanged and let pg report why.
    return { connectionString: raw, isLocal: false };
  }
}

export function buildPoolConfig(raw: string): PoolConfig {
  const { connectionString, isLocal } = parseConnection(raw);
  return {
    connectionString,
    // Neon requires TLS and presents a publicly trusted certificate, so full
    // verification works and there is no reason to weaken it. A local
    // Postgres (if anyone sets one up later) speaks plaintext.
    ssl: isLocal ? false : { rejectUnauthorized: true },
    // Small pool: this is a student project on Neon's free tier, and Neon's
    // pooler already multiplexes on its side.
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  };
}

export function isDatabaseConfigured(): boolean {
  return env.databaseUrl.length > 0;
}

export function getPool(): Pool {
  if (!isDatabaseConfigured()) {
    throw HttpError.serviceUnavailable(
      'database_not_configured',
      'The database is not configured on this server. Set DATABASE_URL in server/.env ' +
        'to your Neon connection string and restart, then run `npm run migrate`.',
    );
  }

  if (pool === null) {
    pool = new Pool(buildPoolConfig(env.databaseUrl));
    // A pool-level 'error' event on an *idle* client is emitted outside any
    // query's promise chain. Without this listener Node treats it as an
    // unhandled 'error' event and kills the process.
    pool.on('error', (error: Error) => {
      console.error('[db] idle client error:', error.message);
    });
  }

  return pool;
}

/**
 * Run a query, translating connection-level failures into a 503 with a
 * message that says what to check. Callers never see a raw pg error.
 */
export async function query<Row extends QueryResultRow>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<Row[]> {
  const activePool = getPool();
  try {
    const result = await activePool.query<Row>(sql, params as unknown[]);
    return result.rows;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[db] query failed:', message);

    if (/duplicate key value violates unique constraint/i.test(message)) {
      throw HttpError.badRequest(
        'duplicate_record',
        'That record conflicts with one that already exists. If this happened during sign-in, ' +
          'your email address may already be attached to a different account.',
      );
    }

    if (/relation .* does not exist/i.test(message)) {
      throw HttpError.serviceUnavailable(
        'database_not_migrated',
        'The database is reachable but the schema is missing. Run `npm run migrate` from the repo root.',
      );
    }

    throw HttpError.serviceUnavailable(
      'database_unavailable',
      'Could not reach the database. Check DATABASE_URL in server/.env and that the Neon project is awake.',
    );
  }
}

export async function closePool(): Promise<void> {
  if (pool !== null) {
    const closing = pool;
    pool = null;
    await closing.end();
  }
}
