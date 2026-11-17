import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSmtpConfig } from './smtp-config.js';

const GMAIL = {
  SMTP_HOST: 'smtp.gmail.com',
  SMTP_PORT: '465',
  SMTP_SECURE: 'true',
  SMTP_USER: 'classmeet.uta@gmail.com',
  SMTP_PASS: 'abcd efgh ijkl mnop',
  EMAIL_FROM: 'Class Meet <classmeet.uta@gmail.com>',
};

test('nothing set is "not configured"', () => {
  assert.equal(readSmtpConfig({}), null);
  assert.equal(readSmtpConfig({ SMTP_HOST: '  ', SMTP_USER: '' }), null);
});

test('reads a full Gmail configuration', () => {
  assert.deepEqual(readSmtpConfig(GMAIL), {
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: 'classmeet.uta@gmail.com', pass: 'abcd efgh ijkl mnop' },
    from: 'Class Meet <classmeet.uta@gmail.com>',
  });
});

test('fills in the port and TLS mode from each other', () => {
  const base = { SMTP_HOST: 'smtp-relay.brevo.com', EMAIL_FROM: 'a@b.edu' };
  assert.deepEqual(
    [readSmtpConfig(base)?.port, readSmtpConfig(base)?.secure],
    [465, true],
  );
  const starttls = readSmtpConfig({ ...base, SMTP_PORT: '587' });
  assert.deepEqual([starttls?.port, starttls?.secure], [587, false]);
  const explicit = readSmtpConfig({ ...base, SMTP_SECURE: 'false' });
  assert.deepEqual([explicit?.port, explicit?.secure], [587, false]);
  assert.equal(readSmtpConfig({ ...base, SMTP_USER: '', SMTP_PASS: '' })?.auth, null);
});

test('refuses a partial or malformed configuration', () => {
  assert.throws(() => readSmtpConfig({ SMTP_USER: 'a@b.edu' }), /SMTP_USER is set but SMTP_HOST is empty/);
  assert.equal(readSmtpConfig({ EMAIL_FROM: 'a@b.edu' }), null, 'EMAIL_FROM alone may belong to the Brevo sender');
  assert.throws(() => readSmtpConfig({ ...GMAIL, EMAIL_FROM: '' }), /EMAIL_FROM is required/);
  assert.throws(() => readSmtpConfig({ ...GMAIL, SMTP_PASS: '' }), /both SMTP_USER and SMTP_PASS/);
  assert.throws(() => readSmtpConfig({ ...GMAIL, SMTP_SECURE: 'yes' }), /SMTP_SECURE must be/);
  assert.throws(() => readSmtpConfig({ ...GMAIL, SMTP_PORT: '99999' }), /SMTP_PORT must be/);
  assert.throws(
    () => readSmtpConfig({ ...GMAIL, EMAIL_FROM: 'a@b.edu\r\nBcc: everyone@uta.edu' }),
    /single line/,
  );
});
