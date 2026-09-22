/**
 * Migration runner.
 *
 * Deliberately about a hundred lines instead of a dependency. Migrations are
 * numbered .sql files in `server/migrations/`; this script applies the ones
 * that have not run yet, in filename order, each inside a transaction, and
 * records it in a `schema_migrations` table. That is the whole model, and a
 * teammate can read it in one sitting.
 *
 * There is no `down`. Rolling a schema back in a four-person student project
 * is more likely to destroy data than save it — to undo something, add
 * another numbered file that undoes it. (If the schema ever outgrows this,
 * `node-pg-migrate` is the natural next step and uses the same idea.)
 *
 * It connects with DIRECT_DATABASE_URL when set, because Neon documents the
 * direct (non "-pooler") endpoint for migrations and DDL — transaction
 * pooling does not fully support them. It falls back to DATABASE_URL.
 *
 * Usage:
 *   npm run migrate            apply pending migrations
 *   npm run migrate:status     list applied / pending, change nothing
 */
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { env } from '../env.js';
import { buildPoolConfig } from '../db/pool.js';

/**
 * Walk up from this file until a `migrations/` directory turns up, so the
 * script works both when run from source via tsx (src/scripts/) and from
 * compiled output (dist/scripts/).
 */
function locateMigrationsDir(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 5; depth += 1) {
    const candidate = path.join(dir, 'migrations');
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Could not find the server/migrations directory next to this script.');
}

const MIGRATIONS_DIR = locateMigrationsDir();

interface AppliedRow {
  name: string;
}

async function listMigrationFiles(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'en'));
}

function connectionString(): string {
  const chosen = env.directDatabaseUrl || env.databaseUrl;
  if (!chosen) {
    throw new Error(
      'No database connection string.\n' +
        'Set DATABASE_URL (and ideally DIRECT_DATABASE_URL) in server/.env, then run this again.\n' +
        'See the "Running the app" section of the README for how to get one from Neon.',
    );
  }
  return chosen;
}

async function main(): Promise<void> {
  const statusOnly = process.argv.includes('--status');
  const files = await listMigrationFiles();

  if (files.length === 0) {
    console.log('[migrate] no .sql files in server/migrations — nothing to do');
    return;
  }

  const usingDirect = env.directDatabaseUrl.length > 0;
  const client = new Client(buildPoolConfig(connectionString()));

  try {
    await client.connect();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not connect to the database: ${detail}\n` +
        'Check the connection string in server/.env and that the Neon project exists.',
    );
  }

  console.log(
    `[migrate] connected using ${usingDirect ? 'DIRECT_DATABASE_URL (direct endpoint)' : 'DATABASE_URL'}`,
  );

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name        text        PRIMARY KEY,
        applied_at  timestamptz NOT NULL DEFAULT now()
      )
    `);

    const applied = await client.query<AppliedRow>('SELECT name FROM schema_migrations');
    const appliedNames = new Set(applied.rows.map((row) => row.name));
    const pending = files.filter((file) => !appliedNames.has(file));

    if (statusOnly) {
      for (const file of files) {
        console.log(`  ${appliedNames.has(file) ? 'applied' : 'pending'}  ${file}`);
      }
      return;
    }

    if (pending.length === 0) {
      console.log(`[migrate] up to date (${files.length} migration(s) already applied)`);
      return;
    }

    for (const file of pending) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`[migrate] applying ${file}`);

      // Each migration is all-or-nothing, so a syntax error halfway through
      // cannot leave the schema in a state no file describes.
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Migration ${file} failed and was rolled back: ${detail}`);
      }
    }

    console.log(`[migrate] applied ${pending.length} migration(s)`);
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  console.error(`[migrate] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
