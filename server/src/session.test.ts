import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { env } from './env.js';
import { createSessionToken, readSessionToken } from './session.js';

const CLAIMS = { userId: '11111111-2222-4333-8444-555566667777', providerObjectId: 'oid-1' };

test('a session token reads back as the claims it was made from', () => {
  assert.deepEqual(readSessionToken(createSessionToken(CLAIMS)), CLAIMS);
});

test('a missing, tampered or foreign token is no session', () => {
  const token = createSessionToken(CLAIMS);
  const [header, , signature] = token.split('.');
  const forgedPayload = Buffer.from(JSON.stringify({ ...CLAIMS, userId: 'someone-else' })).toString('base64url');

  assert.equal(readSessionToken(undefined), null);
  assert.equal(readSessionToken('not-a-token'), null);
  assert.equal(readSessionToken(`${header}.${forgedPayload}.${signature}`), null);
  assert.equal(readSessionToken(jwt.sign(CLAIMS, 'a-different-secret-that-is-long-enough!!', { algorithm: 'HS256' })), null);
});

test('an expired token is no session', () => {
  const expired = jwt.sign(CLAIMS, env.sessionSecret, {
    algorithm: 'HS256',
    issuer: 'class-meet',
    audience: 'class-meet-client',
    expiresIn: -10,
  });
  assert.equal(readSessionToken(expired), null);
});

test('only a literal true marks a development session', () => {
  assert.equal(readSessionToken(createSessionToken({ ...CLAIMS, dev: true }))?.dev, true);
  const truthy = jwt.sign({ ...CLAIMS, dev: 'yes' }, env.sessionSecret, {
    algorithm: 'HS256',
    issuer: 'class-meet',
    audience: 'class-meet-client',
    expiresIn: 60,
  });
  assert.equal(readSessionToken(truthy)?.dev, undefined);
});
