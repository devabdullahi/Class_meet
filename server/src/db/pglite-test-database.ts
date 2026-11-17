/**
 * For tests only: an in-process Postgres (PGlite, Postgres compiled to
 * WebAssembly) with the project's own migrations applied, behind the same
 * `Database` interface the repositories use in production. Repository tests
 * run their real SQL against it instead of against a server.
 *
 * PGlite has a single connection, so tests cannot interleave two
 * transactions; locking is explained where it is written instead.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import type { QueryResultRow } from 'pg';
import type { Database, QueryRunner } from './pool.js';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');

/** A fresh in-memory database with every migration in `server/migrations` applied, in order. */
export async function createMigratedPglite(): Promise<PGlite> {
  const pglite = await PGlite.create();
  const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith('.sql')).sort();
  for (const file of files) {
    await pglite.exec(await readFile(path.join(MIGRATIONS_DIR, file), 'utf8'));
  }
  return pglite;
}

function runnerFor(executor: PGlite | Transaction): QueryRunner {
  return async <Row extends QueryResultRow>(sql: string, params: readonly unknown[] = []) =>
    (await executor.query<Row>(sql, [...params])).rows;
}

export function pgliteDatabase(database: PGlite): Database {
  return {
    query: runnerFor(database),
    transaction: (work) => database.transaction((tx) => work(runnerFor(tx))),
  };
}
