/**
 * Email sign-in over HTTP, end to end on the server: the real router and the
 * real SQL (PGlite with the migrations applied), with only the mail server
 * replaced by a recorder that keeps the codes it was asked to send.
 */
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { PGlite } from '@electric-sql/pglite';

// env.ts validates at import time, so the environment is set first. A value
// already set in server/.env is not used: dotenv never overrides one.
process.env['SESSION_SECRET'] = 'test-session-secret-that-is-long-enough-0123456789';
process.env['NODE_ENV'] = 'test';

const { default: express } = await import('express');
const { default: cookieParser } = await import('cookie-parser');
const { createMigratedPglite, pgliteDatabase } = await import('../db/pglite-test-database.js');
const { createPostgresEmailLoginRepository } = await import('../email-login/repository.js');
const { createRateLimiter } = await import('../middleware/rate-limit.js');
const { requireSameOriginRequest } = await import('../middleware/csrf.js');
const { errorHandler } = await import('../middleware/error-handler.js');
const { SESSION_COOKIE_NAME, readSessionToken } = await import('../session.js');
const { createEmailLoginLimiters, createEmailLoginRouter } = await import('./email-login.js');
type EmailLoginLimiters = import('./email-login.js').EmailLoginLimiters;
type LoginCodeEmail = import('../email-login/mailer.js').LoginCodeEmail;

const EMAIL = 'jane.doe@mavs.uta.edu';

let pglite: PGlite;
let server: Server | undefined;
let baseUrl: string;
let sentEmails: LoginCodeEmail[];
let sendFails: boolean;

async function sql<Row>(text: string, params: unknown[] = []): Promise<Row[]> {
  return (await pglite.query<Row>(text, params)).rows;
}

/** Serves the router with these limiters, replacing any server already running. */
async function serve(limiters: EmailLoginLimiters): Promise<void> {
  if (server !== undefined) {
    server.close();
    await once(server, 'close');
  }
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(requireSameOriginRequest);
  app.use(
    '/api/auth/email',
    createEmailLoginRouter({
      repository: createPostgresEmailLoginRepository(pgliteDatabase(pglite)),
      sender: {
        description: 'recorded by the test',
        send: async (email) => {
          if (sendFails) throw new Error('connect ECONNREFUSED');
          sentEmails.push(email);
        },
      },
      limiters,
    }),
  );
  app.use(errorHandler);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
}

/** Fresh limiters with one rule replaced, so a test reaches that limit quickly. */
async function serveWithLimit(name: keyof EmailLoginLimiters, max: number): Promise<void> {
  await serve({ ...createEmailLoginLimiters(), [name]: createRateLimiter({ max, windowMs: 3_600_000 }) });
}

before(async () => {
  pglite = await createMigratedPglite();
});

after(async () => {
  server?.close();
  await pglite.close();
});

beforeEach(async () => {
  await pglite.exec('TRUNCATE email_login_codes; TRUNCATE users CASCADE;');
  sentEmails = [];
  sendFails = false;
  await serve(createEmailLoginLimiters());
});

interface Reply {
  status: number;
  body: any;
  setCookie: string | null;
  retryAfter: string | null;
}

async function post(path: string, body: unknown, headers: Record<string, string> = { 'X-Class-Meet': '1' }): Promise<Reply> {
  const response = await fetch(`${baseUrl}/api/auth/email${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json(),
    setCookie: response.headers.get('set-cookie'),
    retryAfter: response.headers.get('retry-after'),
  };
}

const start = (email: string) => post('/start', { email });
const verify = (email: string, code: string) => post('/verify', { email, code });

/** The code most recently "emailed". */
function lastCode(): string {
  const email = sentEmails.at(-1);
  assert.ok(email, 'a code was sent');
  return email.code;
}

/** A six-digit code that is not the one that was sent. */
function wrongCode(): string {
  return lastCode() === '000000' ? '111111' : '000000';
}

/** As if `seconds` had passed since the code for `email` was sent. */
async function age(email: string, seconds: number): Promise<void> {
  await sql(
    `UPDATE email_login_codes
        SET created_at = created_at - $2::int * interval '1 second',
            expires_at = expires_at - $2::int * interval '1 second'
      WHERE email = $1`,
    [email, seconds],
  );
}

function sessionUserId(reply: Reply): string | null {
  const match = new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`).exec(reply.setCookie ?? '');
  return readSessionToken(match?.[1])?.userId ?? null;
}

// ---- start ----------------------------------------------------------------

test('start emails a six-digit code to the normalised address', async () => {
  const reply = await start('  Jane.Doe+classes@MAVS.uta.edu ');
  assert.equal(reply.status, 200);
  assert.deepEqual(reply.body, { email: EMAIL, expiresInSeconds: 600, resendAfterSeconds: 60 });
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0]?.to, EMAIL);
  assert.equal(sentEmails[0]?.expiresInMinutes, 10);
  assert.match(lastCode(), /^\d{6}$/);
});

test('start refuses an address outside UTA, and sends nothing', async () => {
  for (const email of ['jane@gmail.com', 'jane@mavs.uta.edu.evil.com', '', 'not an email']) {
    const reply = await start(email);
    assert.equal(reply.status, 400, email);
    assert.equal(reply.body.error.code, 'email_not_allowed');
    assert.match(reply.body.error.message, /@mavs\.uta\.edu or @uta\.edu/);
  }
  assert.equal((await post('/start', {})).body.error.code, 'email_not_allowed');
  assert.equal(sentEmails.length, 0);
});

test('only a hash of the code is stored, never the code', async () => {
  await start(EMAIL);
  const [row] = await sql<{ code_hash: string }>('SELECT code_hash FROM email_login_codes WHERE email = $1', [EMAIL]);
  assert.match(row?.code_hash ?? '', /^[0-9a-f]{64}$/);
  assert.equal(row?.code_hash.includes(lastCode()), false);
});

test('start answers the same whether or not the address has an account', async () => {
  await sql(
    `INSERT INTO users (provider_tenant_id, provider_object_id, email, name)
     VALUES ('email', 'existing@mavs.uta.edu', 'existing@mavs.uta.edu', 'Existing Student')`,
  );
  const existing = await start('existing@mavs.uta.edu');
  const unknown = await start('nobody.yet@mavs.uta.edu');
  assert.equal(existing.status, unknown.status);
  assert.deepEqual(Object.keys(existing.body).sort(), Object.keys(unknown.body).sort());
  assert.deepEqual({ ...existing.body, email: null }, { ...unknown.body, email: null });
  assert.equal(sentEmails.length, 2, 'both get an email');
});

test('a second code within a minute is refused with the wait, and the first code still works', async () => {
  await start(EMAIL);
  const firstCode = lastCode();
  const again = await start(EMAIL);
  assert.equal(again.status, 429);
  assert.equal(again.body.error.code, 'resend_too_soon');
  assert.ok(again.body.error.retryAfterSeconds > 0 && again.body.error.retryAfterSeconds <= 60);
  assert.equal(again.retryAfter, String(again.body.error.retryAfterSeconds));
  assert.equal(sentEmails.length, 1);
  assert.equal((await verify(EMAIL, firstCode)).status, 200);
});

test('a new code after the cooldown replaces the old one', async () => {
  await start(EMAIL);
  const oldCode = lastCode();
  await age(EMAIL, 61);
  assert.equal((await start(EMAIL)).status, 200);
  const newCode = lastCode();
  if (oldCode !== newCode) {
    assert.equal((await verify(EMAIL, oldCode)).body.error.code, 'code_incorrect');
  }
  assert.equal((await verify(EMAIL, newCode)).status, 200);
});

test('when the email cannot be sent, the student hears so and can retry at once', async () => {
  sendFails = true;
  const failed = await start(EMAIL);
  assert.equal(failed.status, 503);
  assert.equal(failed.body.error.code, 'email_send_failed');
  assert.equal(JSON.stringify(failed.body).includes('ECONNREFUSED'), false, 'no internals in the reply');
  assert.equal((await sql('SELECT 1 FROM email_login_codes')).length, 0, 'the unsent code is withdrawn');

  sendFails = false;
  assert.equal((await start(EMAIL)).status, 200);
});

test('start is limited per address', async () => {
  await serveWithLimit('startPerEmail', 2);
  await start(EMAIL);
  await age(EMAIL, 61);
  await start(EMAIL);
  const third = await start(EMAIL);
  assert.equal(third.status, 429);
  assert.equal(third.body.error.code, 'too_many_requests');
  assert.ok(Number(third.retryAfter) > 0);
  assert.equal((await start('someone.else@mavs.uta.edu')).status, 200, 'other addresses are unaffected');
});

test('start is limited per client address', async () => {
  await serveWithLimit('startPerClient', 2);
  assert.equal((await start('a@mavs.uta.edu')).status, 200);
  assert.equal((await start('b@mavs.uta.edu')).status, 200);
  const third = await start('c@mavs.uta.edu');
  assert.equal(third.status, 429);
  assert.equal(third.body.error.code, 'too_many_requests');
});

// ---- verify -----------------------------------------------------------------

test('the right code signs in: a new account and the usual session cookie', async () => {
  await start(EMAIL);
  const reply = await verify(EMAIL, lastCode());
  assert.equal(reply.status, 200);
  assert.equal(reply.body.user.email, EMAIL);
  assert.equal(reply.body.user.name, 'Jane Doe');
  assert.equal(sessionUserId(reply), reply.body.user.id);
  assert.match(reply.setCookie ?? '', /HttpOnly/i);
  assert.match(reply.setCookie ?? '', /SameSite=Lax/i);
});

test('the code can be typed with spaces, and the address in any case', async () => {
  await start(EMAIL);
  const code = lastCode();
  const reply = await verify('JANE.DOE@mavs.uta.edu', `${code.slice(0, 3)} ${code.slice(3)}`);
  assert.equal(reply.status, 200);
});

test('an address that belongs to a Microsoft account signs in to that account', async () => {
  const [microsoft] = await sql<{ id: string }>(
    `INSERT INTO users (provider_tenant_id, provider_object_id, email, name)
     VALUES ('5cdc5b43-d7be-4caa-8173-729e3b0a62d9', 'entra-oid-1', $1, 'Jane Doe') RETURNING id`,
    [EMAIL],
  );
  await start(EMAIL);
  const reply = await verify(EMAIL, lastCode());
  assert.equal(reply.status, 200);
  assert.equal(reply.body.user.id, microsoft?.id);
  assert.equal(sessionUserId(reply), microsoft?.id);
  assert.equal((await sql('SELECT id FROM users')).length, 1);
});

test('a code works once', async () => {
  await start(EMAIL);
  const code = lastCode();
  assert.equal((await verify(EMAIL, code)).status, 200);
  const replay = await verify(EMAIL, code);
  assert.equal(replay.status, 400);
  assert.equal(replay.body.error.code, 'code_expired');
  assert.equal(replay.setCookie, null);
});

test('a wrong code says how many tries are left, and the fifth wrong one burns the code', async () => {
  await start(EMAIL);
  const right = lastCode();
  const wrong = wrongCode();
  for (const triesLeft of [4, 3, 2, 1]) {
    const reply = await verify(EMAIL, wrong);
    assert.equal(reply.status, 400);
    assert.equal(reply.body.error.code, 'code_incorrect');
    assert.match(reply.body.error.message, new RegExp(`${String(triesLeft)} tr(y|ies) left`));
    assert.equal(reply.setCookie, null);
  }
  const fifth = await verify(EMAIL, wrong);
  assert.equal(fifth.body.error.code, 'code_used_up');

  const tooLate = await verify(EMAIL, right);
  assert.equal(tooLate.status, 400);
  assert.equal(tooLate.body.error.code, 'code_expired', 'even the right code no longer works');
});

test('an expired code does not sign in', async () => {
  await start(EMAIL);
  await age(EMAIL, 601);
  const reply = await verify(EMAIL, lastCode());
  assert.equal(reply.status, 400);
  assert.equal(reply.body.error.code, 'code_expired');
  assert.equal(reply.setCookie, null);
});

test("one address's code does not sign in another address", async () => {
  await start(EMAIL);
  await start('sam@mavs.uta.edu');
  const samsCode = lastCode();
  const reply = await verify(EMAIL, samsCode);
  if (sentEmails[0]?.code !== samsCode) {
    assert.equal(reply.body.error.code, 'code_incorrect');
  }
});

test('a malformed code is refused without using up a try', async () => {
  await start(EMAIL);
  for (const code of ['12345', 'abcdef', '1234567']) {
    const reply = await verify(EMAIL, code);
    assert.equal(reply.status, 400);
    assert.equal(reply.body.error.code, 'code_invalid');
  }
  const [row] = await sql<{ attempts: number }>('SELECT attempts FROM email_login_codes');
  assert.equal(row?.attempts, 0);
});

test('verify for an address that was never sent a code', async () => {
  const reply = await verify(EMAIL, '123456');
  assert.equal(reply.status, 400);
  assert.equal(reply.body.error.code, 'code_expired');
});

test('verify is limited per address, across codes', async () => {
  await serveWithLimit('verifyPerEmail', 2);
  await start(EMAIL);
  await verify(EMAIL, wrongCode());
  await verify(EMAIL, wrongCode());
  const third = await verify(EMAIL, lastCode());
  assert.equal(third.status, 429);
  assert.equal(third.body.error.code, 'too_many_requests');
  assert.equal(third.setCookie, null);
});

test('verify is limited per client address', async () => {
  await serveWithLimit('verifyPerClient', 1);
  await verify('a@mavs.uta.edu', '123456');
  const second = await verify('b@mavs.uta.edu', '123456');
  assert.equal(second.status, 429);
});

// ---- CSRF ---------------------------------------------------------------------

test('both endpoints refuse a request without the CSRF header, before doing anything', async () => {
  const startReply = await post('/start', { email: EMAIL }, {});
  assert.equal(startReply.status, 403);
  assert.equal(startReply.body.error.code, 'csrf_header_missing');
  assert.equal(sentEmails.length, 0);

  const verifyReply = await post('/verify', { email: EMAIL, code: '123456' }, { 'X-Class-Meet': '1', Origin: 'https://evil.example' });
  assert.equal(verifyReply.status, 403);
  assert.equal(verifyReply.body.error.code, 'origin_not_allowed');
});
