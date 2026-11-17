import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFromAddress, readEmailDelivery } from './email-delivery-config.js';

const BREVO = {
  EMAIL_PROVIDER: 'brevo',
  BREVO_API_KEY: 'xkeysib-test-key',
  EMAIL_FROM: 'Class Meet <classmeet.uta@gmail.com>',
};

const GMAIL = {
  EMAIL_PROVIDER: 'smtp',
  SMTP_HOST: 'smtp.gmail.com',
  SMTP_USER: 'classmeet.uta@gmail.com',
  SMTP_PASS: 'app-password',
  EMAIL_FROM: 'Class Meet <classmeet.uta@gmail.com>',
};

test('nothing configured is "no provider"', () => {
  assert.equal(readEmailDelivery({}), null);
  assert.equal(readEmailDelivery({ EMAIL_FROM: 'Class Meet <a@b.org>' }), null);
});

test('reads a complete Brevo configuration', () => {
  assert.deepEqual(readEmailDelivery(BREVO), {
    provider: 'brevo',
    brevo: { apiKey: 'xkeysib-test-key', sender: { name: 'Class Meet', email: 'classmeet.uta@gmail.com' } },
  });
});

test('reads a complete SMTP configuration', () => {
  const delivery = readEmailDelivery(GMAIL);
  assert.equal(delivery?.provider, 'smtp');
  assert.equal(delivery?.provider === 'smtp' && delivery.smtp.host, 'smtp.gmail.com');
});

test('works out the provider when only one has settings', () => {
  const { EMAIL_PROVIDER: _brevo, ...brevoOnly } = BREVO;
  const { EMAIL_PROVIDER: _smtp, ...smtpOnly } = GMAIL;
  assert.equal(readEmailDelivery(brevoOnly)?.provider, 'brevo');
  assert.equal(readEmailDelivery(smtpOnly)?.provider, 'smtp');
});

test('names the missing settings of the chosen provider', () => {
  assert.throws(() => readEmailDelivery({ EMAIL_PROVIDER: 'brevo' }), /EMAIL_PROVIDER=brevo needs BREVO_API_KEY and EMAIL_FROM/);
  assert.throws(() => readEmailDelivery({ ...BREVO, EMAIL_FROM: '' }), /EMAIL_PROVIDER=brevo needs EMAIL_FROM/);
  assert.throws(() => readEmailDelivery({ ...BREVO, BREVO_API_KEY: ' ' }), /EMAIL_PROVIDER=brevo needs BREVO_API_KEY\./);
  assert.throws(() => readEmailDelivery({ EMAIL_PROVIDER: 'smtp', EMAIL_FROM: 'a@b.org' }), /EMAIL_PROVIDER=smtp needs SMTP_HOST/);
  assert.throws(() => readEmailDelivery({ ...GMAIL, SMTP_PASS: '' }), /both SMTP_USER and SMTP_PASS/);
});

test('refuses settings for two providers instead of guessing', () => {
  const { EMAIL_PROVIDER: _ignored, ...both } = { ...GMAIL, BREVO_API_KEY: 'xkeysib-test-key' };
  assert.throws(() => readEmailDelivery(both), /SMTP_HOST, SMTP_USER, SMTP_PASS are set, but email goes through Brevo/);
  assert.throws(() => readEmailDelivery({ ...GMAIL, BREVO_API_KEY: 'k' }), /BREVO_API_KEY is set, but email goes through SMTP/);
  assert.throws(() => readEmailDelivery({ ...BREVO, SMTP_HOST: 'smtp.gmail.com' }), /SMTP_HOST is set, but email goes through Brevo/);
});

test('refuses an unknown provider and a malformed sender', () => {
  assert.throws(() => readEmailDelivery({ ...BREVO, EMAIL_PROVIDER: 'sendgrid' }), /must be "brevo" or "smtp"/);
  assert.throws(() => readEmailDelivery({ ...BREVO, EMAIL_FROM: 'Class Meet' }), /EMAIL_FROM must be an address/);
});

test('reads a From line with or without a name', () => {
  assert.deepEqual(parseFromAddress('Class Meet <a@b.org>'), { name: 'Class Meet', email: 'a@b.org' });
  assert.deepEqual(parseFromAddress('"Class Meet" <a@b.org>'), { name: 'Class Meet', email: 'a@b.org' });
  assert.deepEqual(parseFromAddress('<a@b.org>'), { name: null, email: 'a@b.org' });
  assert.deepEqual(parseFromAddress('a@b.org'), { name: null, email: 'a@b.org' });
  assert.equal(parseFromAddress('Class Meet'), null);
  assert.equal(parseFromAddress('a@b'), null);
});
