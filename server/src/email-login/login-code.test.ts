import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateLoginCode, hashLoginCode, loginCodeMatches, readSubmittedCode } from './login-code.js';

const SECRET = 'test-session-secret-that-is-long-enough-0123456789';
const EMAIL = 'jane@mavs.uta.edu';

test('a code is six digits, and codes vary', () => {
  const codes = new Set<string>();
  for (let index = 0; index < 200; index += 1) {
    const code = generateLoginCode();
    assert.match(code, /^\d{6}$/);
    codes.add(code);
  }
  // 200 draws from a million values: a repeat or two is possible, a handful is not.
  assert.ok(codes.size > 195);
});

test('the stored hash is a keyed HMAC that does not contain the code', () => {
  const hash = hashLoginCode(EMAIL, '012345', SECRET);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash.includes('012345'), false);
  assert.equal(hashLoginCode(EMAIL, '012345', SECRET), hash, 'deterministic for the same input');
  assert.notEqual(hashLoginCode(EMAIL, '012345', `${SECRET}-other`), hash, 'depends on the secret');
  assert.notEqual(hashLoginCode('sam@mavs.uta.edu', '012345', SECRET), hash, 'bound to the address');
});

test('only the right code for the right address matches', () => {
  const stored = hashLoginCode(EMAIL, '654321', SECRET);
  assert.equal(loginCodeMatches(EMAIL, '654321', stored, SECRET), true);
  assert.equal(loginCodeMatches(EMAIL, '654320', stored, SECRET), false);
  assert.equal(loginCodeMatches('sam@mavs.uta.edu', '654321', stored, SECRET), false);
  assert.equal(loginCodeMatches(EMAIL, '654321', 'not-hex', SECRET), false);
  assert.equal(loginCodeMatches(EMAIL, '654321', '', SECRET), false);
});

test('reads a typed code, forgiving spaces and hyphens', () => {
  assert.equal(readSubmittedCode('123456'), '123456');
  assert.equal(readSubmittedCode(' 123 456 '), '123456');
  assert.equal(readSubmittedCode('123-456'), '123456');
  for (const value of ['12345', '1234567', '12345a', '', '１２３４５６', 123456, null, undefined]) {
    assert.equal(readSubmittedCode(value), null, JSON.stringify(value));
  }
});
