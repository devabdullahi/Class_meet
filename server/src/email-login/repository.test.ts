/**
 * The email sign-in SQL against a real Postgres: PGlite, with the project's
 * migrations applied, as in groups/repository.test.ts.
 */
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { createMigratedPglite, pgliteDatabase } from '../db/pglite-test-database.js';
import { createPostgresEmailLoginRepository, type EmailLoginRepository } from './repository.js';

const TIMINGS = { ttlSeconds: 600, resendCooldownSeconds: 60 };
const EMAIL = 'jane@mavs.uta.edu';

let pglite: PGlite;
let repository: EmailLoginRepository;

async function sql<Row>(text: string, params: unknown[] = []): Promise<Row[]> {
  return (await pglite.query<Row>(text, params)).rows;
}

/** Moves the stored code's clock back, as if `seconds` had passed since it was sent. */
async function age(email: string, seconds: number): Promise<void> {
  await sql(
    `UPDATE email_login_codes
        SET created_at = created_at - $2::int * interval '1 second',
            expires_at = expires_at - $2::int * interval '1 second'
      WHERE email = $1`,
    [email, seconds],
  );
}

before(async () => {
  pglite = await createMigratedPglite();
  repository = createPostgresEmailLoginRepository(pgliteDatabase(pglite));
});

after(async () => {
  await pglite.close();
});

beforeEach(async () => {
  await pglite.exec('TRUNCATE email_login_codes; TRUNCATE users CASCADE;');
});

test('issuing stores the hash with a ten-minute expiry and no attempts', async () => {
  assert.deepEqual(await repository.issueCode(EMAIL, 'hash-1', TIMINGS), { outcome: 'issued' });
  const [row] = await sql<{ code_hash: string; attempts: number; lifetime: number }>(
    `SELECT code_hash, attempts, extract(epoch FROM expires_at - created_at)::int AS lifetime
       FROM email_login_codes WHERE email = $1`,
    [EMAIL],
  );
  assert.deepEqual(row, { code_hash: 'hash-1', attempts: 0, lifetime: 600 });
});

test('a second code within the cooldown is refused, with the seconds left', async () => {
  await repository.issueCode(EMAIL, 'hash-1', TIMINGS);
  await age(EMAIL, 20);
  const outcome = await repository.issueCode(EMAIL, 'hash-2', TIMINGS);
  assert.equal(outcome.outcome, 'too_soon');
  assert.ok(outcome.outcome === 'too_soon' && outcome.retryAfterSeconds >= 39 && outcome.retryAfterSeconds <= 41);
  const [row] = await sql<{ code_hash: string }>('SELECT code_hash FROM email_login_codes');
  assert.equal(row?.code_hash, 'hash-1', 'the first code still stands');
});

test('after the cooldown a new code replaces the old one and resets its attempts', async () => {
  await repository.issueCode(EMAIL, 'hash-1', TIMINGS);
  await repository.countAttempt(EMAIL, 5);
  await age(EMAIL, 61);
  assert.deepEqual(await repository.issueCode(EMAIL, 'hash-2', TIMINGS), { outcome: 'issued' });
  const rows = await sql<{ code_hash: string; attempts: number }>('SELECT code_hash, attempts FROM email_login_codes');
  assert.deepEqual(rows, [{ code_hash: 'hash-2', attempts: 0 }]);
});

test('the cooldown is per address', async () => {
  await repository.issueCode(EMAIL, 'hash-1', TIMINGS);
  assert.deepEqual(await repository.issueCode('sam@mavs.uta.edu', 'hash-2', TIMINGS), { outcome: 'issued' });
});

test('each guess is counted, and the fifth is the last one allowed', async () => {
  await repository.issueCode(EMAIL, 'hash-1', TIMINGS);
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    assert.deepEqual(await repository.countAttempt(EMAIL, 5), { codeHash: 'hash-1', attempts: attempt });
  }
  assert.equal(await repository.countAttempt(EMAIL, 5), null);
});

test('an expired code cannot be guessed', async () => {
  await repository.issueCode(EMAIL, 'hash-1', TIMINGS);
  await age(EMAIL, 601);
  assert.equal(await repository.countAttempt(EMAIL, 5), null);
});

test('an address with no code has nothing to guess', async () => {
  assert.equal(await repository.countAttempt(EMAIL, 5), null);
});

test('deleting a code succeeds once, and only for the matching hash', async () => {
  await repository.issueCode(EMAIL, 'hash-1', TIMINGS);
  assert.equal(await repository.deleteCode(EMAIL, 'hash-other'), false);
  assert.equal(await repository.deleteCode(EMAIL, 'hash-1'), true);
  assert.equal(await repository.deleteCode(EMAIL, 'hash-1'), false);
});

test('expired codes are cleared, live ones kept', async () => {
  await repository.issueCode(EMAIL, 'hash-1', TIMINGS);
  await repository.issueCode('sam@mavs.uta.edu', 'hash-2', TIMINGS);
  await age(EMAIL, 601);
  await repository.deleteExpiredCodes();
  const rows = await sql<{ email: string }>('SELECT email FROM email_login_codes');
  assert.deepEqual(rows, [{ email: 'sam@mavs.uta.edu' }]);
});

test('a new address gets a new account, marked as an email sign-in', async () => {
  const user = await repository.findOrCreateUserByEmail(EMAIL, 'Jane');
  assert.equal(user.email, EMAIL);
  assert.equal(user.name, 'Jane');
  const [row] = await sql<{ provider_tenant_id: string; provider_object_id: string }>(
    'SELECT provider_tenant_id, provider_object_id FROM users WHERE id = $1',
    [user.id],
  );
  assert.deepEqual(row, { provider_tenant_id: 'email', provider_object_id: EMAIL });
});

test('the same address signs in to the same account every time', async () => {
  const first = await repository.findOrCreateUserByEmail(EMAIL, 'Jane');
  const second = await repository.findOrCreateUserByEmail(EMAIL, 'Someone Else');
  assert.equal(second.id, first.id);
  assert.equal(second.name, 'Jane', 'an existing name is kept');
  assert.equal((await sql('SELECT id FROM users')).length, 1);
});

test('an address that already belongs to a Microsoft account signs in to that account', async () => {
  const [microsoft] = await sql<{ id: string }>(
    `INSERT INTO users (provider_tenant_id, provider_object_id, email, name, last_login_at)
     VALUES ('5cdc5b43-d7be-4caa-8173-729e3b0a62d9', 'entra-oid-1', $1, 'Jane Doe', now() - interval '3 days')
     RETURNING id`,
    [EMAIL],
  );
  const user = await repository.findOrCreateUserByEmail(EMAIL, 'Jane');
  assert.equal(user.id, microsoft?.id);
  assert.equal(user.name, 'Jane Doe');
  assert.ok(Date.now() - Date.parse(user.lastLoginAt) < 60_000, 'last_login_at is refreshed');
  const [row] = await sql<{ provider_tenant_id: string; provider_object_id: string }>(
    'SELECT provider_tenant_id, provider_object_id FROM users WHERE id = $1',
    [user.id],
  );
  assert.deepEqual(row, { provider_tenant_id: '5cdc5b43-d7be-4caa-8173-729e3b0a62d9', provider_object_id: 'entra-oid-1' });
});
