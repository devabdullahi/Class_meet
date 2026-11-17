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
import express from 'express';
import cookieParser from 'cookie-parser';
import type { PGlite } from '@electric-sql/pglite';
import { createMigratedPglite, pgliteDatabase } from '../db/pglite-test-database.js';
import { createPostgresEmailLoginRepository } from '../email-login/repository.js';
import { generateLoginCode } from '../email-login/login-code.js';
import type { LoginCodeEmail } from '../email-login/mailer.js';
import { createRateLimiter } from '../middleware/rate-limit.js';
import { requireSameOriginRequest } from '../middleware/csrf.js';
import { errorHandler } from '../middleware/error-handler.js';
import { SESSION_COOKIE_NAME, readSessionToken } from '../session.js';
import { createEmailLoginLimiters, createEmailLoginRouter, type EmailLoginLimiters } from './email-login.js';

const EMAIL = 'jane.doe@mavs.uta.edu';
const CODE_REJECTED = "That code didn't work. Check the newest email or ask for a new code.";

let pglite: PGlite;
let server: Server | undefined;
let baseUrl: string;
let sentEmails: LoginCodeEmail[];
let sendFailure: Error | null;
/** Codes the next sends will use, in order; random once it runs out. */
let scriptedCodes: string[];

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
          if (sendFailure !== null) throw sendFailure;
          sentEmails.push(email);
        },
      },
      limiters,
      generateCode: () => scriptedCodes.shift() ?? generateLoginCode(),
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
  sendFailure = null;
  scriptedCodes = [];
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

/** Runs `work` with console.error and console.warn captured, and returns what they printed. */
async function captureLogs(work: () => Promise<void>): Promise<string> {
  const lines: string[] = [];
  const original = { error: console.error, warn: console.warn };
  const record = (...parts: unknown[]) => {
    lines.push(parts.map((part) => (part instanceof Error ? part.message : String(part))).join(' '));
  };
  console.error = record;
  console.warn = record;
  try {
    await work();
  } finally {
    console.error = original.error;
    console.warn = original.warn;
  }
  return lines.join('\n');
}

function assertRejected(reply: Reply): void {
  assert.equal(reply.status, 400);
  assert.deepEqual(reply.body, { error: { code: 'code_rejected', message: CODE_REJECTED } });
  assert.equal(reply.setCookie, null);
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
  scriptedCodes = ['111111', '222222'];
  await start(EMAIL);
  await age(EMAIL, 61);
  assert.equal((await start(EMAIL)).status, 200);
  assertRejected(await verify(EMAIL, '111111'));
  assert.equal((await verify(EMAIL, '222222')).status, 200);
});

test('when the email cannot be sent, the student hears so and can retry at once', async () => {
  sendFailure = new Error('connect ECONNREFUSED');
  const failed = await start(EMAIL);
  assert.equal(failed.status, 503);
  assert.equal(failed.body.error.code, 'email_send_failed');
  assert.equal(JSON.stringify(failed.body).includes('ECONNREFUSED'), false, 'no internals in the reply');
  assert.equal((await sql('SELECT 1 FROM email_login_codes')).length, 0, 'the unsent code is withdrawn');

  sendFailure = null;
  assert.equal((await start(EMAIL)).status, 200);
});

// Regression (N1): mail servers quote the recipient in their errors.
test("a failed send is logged with the provider's reason but without any email address", async () => {
  sendFailure = new Error('550 5.1.1 <jane.doe@mavs.uta.edu>: Recipient address rejected; from classmeet.uta@gmail.com');
  const logged = await captureLogs(async () => {
    assert.equal((await start(EMAIL)).status, 503);
  });
  assert.match(logged, /could not send a sign-in code/);
  assert.match(logged, /550 5\.1\.1/);
  assert.equal(logged.includes('@'), false, logged);
});

// Regression (S1): resend_too_soon answers used to spend the address's hourly
// allowance, so six quick requests locked its owner out for an hour.
test('requests refused for being too soon do not use up the address allowance', async () => {
  assert.equal((await start(EMAIL)).status, 200);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal((await start(EMAIL)).body.error.code, 'resend_too_soon');
  }
  await age(EMAIL, 61);
  assert.equal((await start(EMAIL)).status, 200);
});

test('start is limited per address, counting codes actually sent', async () => {
  await serveWithLimit('startPerEmail', 2);
  await start(EMAIL);
  await age(EMAIL, 61);
  await start(EMAIL);
  await age(EMAIL, 61);
  const third = await start(EMAIL);
  assert.equal(third.status, 429);
  assert.equal(third.body.error.code, 'too_many_requests');
  assert.ok(Number(third.retryAfter) > 0);
  assert.equal(sentEmails.length, 2);
  assert.equal((await start('someone.else@mavs.uta.edu')).status, 200, 'other addresses are unaffected');
});

test('start is limited per client address, at ten requests per window by default', async () => {
  for (let index = 0; index < 10; index += 1) {
    assert.equal((await start(`student${String(index)}@mavs.uta.edu`)).status, 200);
  }
  const eleventh = await start('student10@mavs.uta.edu');
  assert.equal(eleventh.status, 429);
  assert.equal(eleventh.body.error.code, 'too_many_requests');
});

// Regression (S2): nothing capped the total, so codes to many different
// addresses could use up the provider's daily allowance for everyone.
test('a global cap on codes sent stops sending for everyone, politely, and says so in the log', async () => {
  await serveWithLimit('sendsPerHour', 2);
  assert.equal((await start('a@mavs.uta.edu')).status, 200);
  assert.equal((await start('a@mavs.uta.edu')).body.error.code, 'resend_too_soon', 'not a send');
  assert.equal((await start('b@mavs.uta.edu')).status, 200);

  let capped: Reply | undefined;
  const logged = await captureLogs(async () => {
    capped = await start('c@mavs.uta.edu');
  });
  assert.equal(capped?.status, 503);
  assert.equal(capped?.body.error.code, 'email_temporarily_unavailable');
  assert.match(capped?.body.error.message ?? '', /try again/i);
  assert.equal(sentEmails.length, 2);
  assert.match(logged, /limit/i);
  assert.equal(logged.includes('@'), false, 'no addresses in the log');
});

test('the daily cap applies the same way', async () => {
  await serveWithLimit('sendsPerDay', 1);
  assert.equal((await start('a@mavs.uta.edu')).status, 200);
  assert.equal((await start('b@mavs.uta.edu')).body.error.code, 'email_temporarily_unavailable');
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
  assertRejected(await verify(EMAIL, code));
});

test('five wrong codes burn the code: even the right one no longer works', async () => {
  await start(EMAIL);
  const right = lastCode();
  const wrong = wrongCode();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assertRejected(await verify(EMAIL, wrong));
  }
  assertRejected(await verify(EMAIL, right));
  const [row] = await sql<{ attempts: number }>('SELECT attempts FROM email_login_codes');
  assert.equal(row?.attempts, 5, 'each wrong code was counted');
});

test('an expired code does not sign in', async () => {
  await start(EMAIL);
  await age(EMAIL, 601);
  assertRejected(await verify(EMAIL, lastCode()));
});

// Regression (N2): "expired" and "N tries left" told an attacker whether an
// address had asked for a code recently.
test('a wrong code, an expired code and no code at all get the same answer', async () => {
  const noCode = await verify('nobody@mavs.uta.edu', '123456');
  await start(EMAIL);
  const wrong = await verify(EMAIL, wrongCode());
  await start('sam@mavs.uta.edu');
  await age('sam@mavs.uta.edu', 601);
  const expired = await verify('sam@mavs.uta.edu', lastCode());
  assert.deepEqual(noCode, wrong);
  assert.deepEqual(wrong, expired);
  assertRejected(noCode);
});

// Regression (N5): this used to assert nothing when the two random codes matched.
test("one address's code does not sign in another address", async () => {
  scriptedCodes = ['111111', '222222'];
  await start(EMAIL);
  await start('sam@mavs.uta.edu');
  assertRejected(await verify(EMAIL, '222222'));
  assert.equal((await verify(EMAIL, '111111')).status, 200, 'the right code still works afterwards');
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

// Regression (S1): a per-address cap on guesses let anyone lock an address
// out for fifteen minutes; each code's own five tries already bound guessing.
test('wrong guesses at old codes never lock the address out', async () => {
  for (let round = 0; round < 4; round += 1) {
    await start(EMAIL);
    for (let attempt = 0; attempt < 5; attempt += 1) await verify(EMAIL, wrongCode());
    await age(EMAIL, 61);
  }
  await start(EMAIL);
  assert.equal((await verify(EMAIL, lastCode())).status, 200);
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
