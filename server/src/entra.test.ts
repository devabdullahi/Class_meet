/**
 * The access policy applied to a Microsoft token after its signature,
 * issuer, audience and lifetime have been verified (see entra.ts).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { JWTPayload } from 'jose';
import { applyAccessPolicy } from './entra.js';
import { env } from './env.js';
import { isHttpError } from './errors.js';

function token(overrides: Record<string, unknown> = {}): JWTPayload {
  return {
    ver: '2.0',
    tid: env.utaTenantId,
    scp: env.apiScopeName,
    oid: '0f0e0d0c-1111-4222-8333-444455556666',
    preferred_username: 'Sam.Lee@MAVS.uta.edu',
    name: 'Sam Lee',
    ...overrides,
  };
}

function refusal(payload: JWTPayload): { status: number; code: string } {
  try {
    applyAccessPolicy(payload);
  } catch (error) {
    if (isHttpError(error)) return { status: error.status, code: error.code };
    throw error;
  }
  assert.fail('expected the token to be refused');
}

test('a UTA user token with the Class Meet scope is accepted, keyed by tenant and object id', () => {
  assert.deepEqual(applyAccessPolicy(token({ tid: env.utaTenantId.toUpperCase() })), {
    objectId: '0f0e0d0c-1111-4222-8333-444455556666',
    tenantId: env.utaTenantId,
    email: 'sam.lee@mavs.uta.edu',
    name: 'Sam Lee',
  });
});

test('a token from any other tenant is refused, whatever its email says', () => {
  const otherTenant = token({ tid: '72f988bf-86f1-41af-91ab-2d7cd011db47', preferred_username: 'x@mavs.uta.edu' });
  assert.deepEqual(refusal(otherTenant), { status: 403, code: 'tenant_not_allowed' });
});

test('a v1.0 token is refused rather than read with the wrong claim names', () => {
  assert.deepEqual(refusal(token({ ver: '1.0' })), { status: 401, code: 'invalid_entra_token' });
});

test('the token must carry the Class Meet scope; an app-only token has none', () => {
  assert.deepEqual(refusal(token({ scp: 'User.Read' })), { status: 403, code: 'scope_missing' });
  assert.deepEqual(refusal(token({ scp: undefined })), { status: 403, code: 'scope_missing' });
  assert.equal(applyAccessPolicy(token({ scp: `User.Read ${env.apiScopeName}` })).name, 'Sam Lee');
});

test('a token without an object id is refused instead of keying the account on the email', () => {
  assert.deepEqual(refusal(token({ oid: undefined })), { status: 403, code: 'object_id_missing' });
});

test('the email falls back from preferred_username to upn to email, and is required', () => {
  assert.equal(applyAccessPolicy(token({ preferred_username: undefined, upn: 'UPN@uta.edu' })).email, 'upn@uta.edu');
  assert.equal(applyAccessPolicy(token({ preferred_username: ' ', email: 'mail@uta.edu' })).email, 'mail@uta.edu');
  assert.deepEqual(refusal(token({ preferred_username: undefined })), { status: 403, code: 'email_missing' });
});

test('without a name claim, the part of the email before the @ stands in', () => {
  assert.equal(applyAccessPolicy(token({ name: undefined })).name, 'sam.lee');
});
