import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  composeLoginCodeEmail,
  createConsoleLoginCodeSender,
  createLoginCodeSender,
  createSmtpLoginCodeSender,
  type MailTransport,
} from './mailer.js';
import type { SmtpConfig } from './smtp-config.js';

const SMTP: SmtpConfig = {
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: { user: 'classmeet.uta@gmail.com', pass: 'app-password' },
  from: 'Class Meet <classmeet.uta@gmail.com>',
};

test('the email states the code, its expiry, and what to do if it was not you', () => {
  const email = composeLoginCodeEmail('042817', 10);
  assert.equal(email.subject, 'Your Class Meet sign-in code');
  for (const body of [email.text, email.html]) {
    assert.ok(body.includes('042817'));
    assert.ok(body.includes('It expires in 10 minutes.'));
    assert.ok(body.includes("If you didn't ask for this, ignore this email."));
  }
  assert.equal(/https?:/.test(email.html), false, 'no links in a code email');
});

test('the SMTP sender hands one message to the transport, from EMAIL_FROM to the student', async () => {
  const sent: unknown[] = [];
  const transport: MailTransport = {
    sendMail: async (message) => {
      sent.push(message);
    },
  };
  await createSmtpLoginCodeSender(SMTP, transport).send({ to: 'jane@mavs.uta.edu', code: '123456', expiresInMinutes: 10 });
  assert.deepEqual(sent, [
    {
      from: 'Class Meet <classmeet.uta@gmail.com>',
      to: 'jane@mavs.uta.edu',
      ...composeLoginCodeEmail('123456', 10),
    },
  ]);
});

test('a failed SMTP send is reported to the caller, not swallowed', async () => {
  const transport: MailTransport = {
    sendMail: async () => {
      throw new Error('Invalid login: 535 Username and Password not accepted');
    },
  };
  await assert.rejects(
    createSmtpLoginCodeSender(SMTP, transport).send({ to: 'jane@mavs.uta.edu', code: '123456', expiresInMinutes: 10 }),
    /535/,
  );
});

test('without SMTP in development, the code is printed with a [dev email] prefix', async () => {
  const lines: string[] = [];
  await createConsoleLoginCodeSender((line) => lines.push(line)).send({
    to: 'jane@mavs.uta.edu',
    code: '123456',
    expiresInMinutes: 10,
  });
  assert.deepEqual(lines, ['[dev email] to jane@mavs.uta.edu: Class Meet sign-in code 123456 (expires in 10 minutes)']);
});

test('never prints codes in production: without SMTP there is no sender at all', () => {
  assert.throws(() => createLoginCodeSender({ isProduction: true, smtp: null }), /Refusing to print sign-in codes/);
  assert.match(createLoginCodeSender({ isProduction: false, smtp: null }).description, /console/);
  assert.match(createLoginCodeSender({ isProduction: true, smtp: SMTP }).description, /smtp\.gmail\.com:465/);
});
