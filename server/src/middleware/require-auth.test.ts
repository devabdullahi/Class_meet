/**
 * requireAuth over HTTP. The environment comes from src/testing/test-env.ts,
 * which leaves ALLOW_DEV_LOGIN unset: the development sign-in bypass is off,
 * as it is on every deployment.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import cookieParser from 'cookie-parser';
import { SESSION_COOKIE_NAME, createSessionToken } from '../session.js';
import { errorHandler } from './error-handler.js';
import { requireAuth } from './require-auth.js';

let server: Server;
let baseUrl: string;

before(async () => {
  const app = express();
  app.use(cookieParser());
  app.get('/protected', requireAuth, (req, res) => {
    res.status(200).json({ userId: req.session?.userId });
  });
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
});

async function getProtected(token?: string): Promise<Response> {
  const headers: Record<string, string> = token === undefined ? {} : { cookie: `${SESSION_COOKIE_NAME}=${token}` };
  return fetch(`${baseUrl}/protected`, { headers });
}

test('a signed-in student gets through', async () => {
  const response = await getProtected(createSessionToken({ userId: 'user-1', providerObjectId: 'email-code' }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { userId: 'user-1' });
});

test('no session is a 401', async () => {
  const response = await getProtected();
  assert.equal(response.status, 401);
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(body.error.code, 'not_authenticated');
});

// A dev cookie validly signed with the server's secret (a secret reused from
// a laptop where the bypass was on) must not open any protected route once
// the bypass is off, and the stale cookie is cleared.
test('a session from the development bypass is refused while the bypass is off', async () => {
  const devToken = createSessionToken({ userId: '00000000-0000-4000-8000-000000000000', providerObjectId: 'dev', dev: true });
  const response = await getProtected(devToken);
  assert.equal(response.status, 401);
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(body.error.code, 'dev_login_disabled');
  assert.match(response.headers.get('set-cookie') ?? '', new RegExp(`^${SESSION_COOKIE_NAME}=;`));
});
