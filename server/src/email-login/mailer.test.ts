import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BREVO_SEND_URL,
  composeLoginCodeEmail,
  createBrevoLoginCodeSender,
  createConsoleLoginCodeSender,
  createLoginCodeSender,
  createSmtpLoginCodeSender,
  type MailTransport,
} from './mailer.js';
import type { SmtpConfig } from './smtp-config.js';
import type { BrevoConfig } from './email-delivery-config.js';

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

const BREVO: BrevoConfig = {
  apiKey: 'xkeysib-secret-key',
  sender: { name: 'Class Meet', email: 'classmeet.uta@gmail.com' },
};

const EMAIL = { to: 'jane@mavs.uta.edu', code: '123456', expiresInMinutes: 10 };

/** A fetch that records its call and answers with `response` (or throws `failure`). */
function recordingFetch(response: Response | Error) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    if (response instanceof Error) throw response;
    return response;
  }) as typeof fetch;
  return { calls, fetchImpl };
}

test('the Brevo sender posts one transactional email in the shape Brevo documents', async () => {
  const { calls, fetchImpl } = recordingFetch(new Response(JSON.stringify({ messageId: '<1@relay>' }), { status: 201 }));
  await createBrevoLoginCodeSender(BREVO, fetchImpl).send(EMAIL);

  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.equal(call?.url, BREVO_SEND_URL);
  assert.equal(call?.url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(call?.init.method, 'POST');
  const headers = call?.init.headers as Record<string, string>;
  assert.equal(headers['api-key'], 'xkeysib-secret-key');
  assert.equal(headers['content-type'], 'application/json');
  assert.ok(call?.init.signal instanceof AbortSignal, 'the request has a timeout');

  const email = composeLoginCodeEmail('123456', 10);
  assert.deepEqual(JSON.parse(String(call?.init.body)), {
    sender: { name: 'Class Meet', email: 'classmeet.uta@gmail.com' },
    to: [{ email: 'jane@mavs.uta.edu' }],
    subject: email.subject,
    textContent: email.text,
    htmlContent: email.html,
  });
});

test('a sender with no display name is sent as a bare address', async () => {
  const { calls, fetchImpl } = recordingFetch(new Response('{}', { status: 201 }));
  await createBrevoLoginCodeSender({ ...BREVO, sender: { name: null, email: 'a@b.org' } }, fetchImpl).send(EMAIL);
  assert.deepEqual(JSON.parse(String(calls[0]?.init.body)).sender, { email: 'a@b.org' });
});

test("Brevo's refusal is reported with its status and reason, without the key or the code", async () => {
  const { fetchImpl } = recordingFetch(
    new Response(JSON.stringify({ code: 'unauthorized', message: 'Key not found' }), { status: 401 }),
  );
  const failure = await createBrevoLoginCodeSender(BREVO, fetchImpl).send(EMAIL).then(
    () => null,
    (error: unknown) => error,
  );
  assert.ok(failure instanceof Error);
  assert.equal(failure.message, 'Brevo refused the email: HTTP 401 (unauthorized: Key not found)');
  assert.equal(failure.message.includes('xkeysib'), false);
  assert.equal(failure.message.includes('123456'), false);
});

test('a non-JSON error page is reported by its status', async () => {
  const { fetchImpl } = recordingFetch(new Response('<html>Bad gateway</html>', { status: 502 }));
  await assert.rejects(createBrevoLoginCodeSender(BREVO, fetchImpl).send(EMAIL), /^Error: Brevo refused the email: HTTP 502$/);
});

test('a timeout or network failure rejects, so the route can answer 503', async () => {
  const timeout = new Error('The operation was aborted due to timeout');
  timeout.name = 'TimeoutError';
  await assert.rejects(createBrevoLoginCodeSender(BREVO, recordingFetch(timeout).fetchImpl).send(EMAIL), /Brevo API timed out/);
  await assert.rejects(
    createBrevoLoginCodeSender(BREVO, recordingFetch(new TypeError('fetch failed')).fetchImpl).send(EMAIL),
    /Brevo API could not be reached: fetch failed/,
  );
});

test('the configured provider decides the sender; production never falls back to the console', () => {
  assert.throws(
    () => createLoginCodeSender({ isProduction: true, emailDelivery: null }),
    /Refusing to print sign-in codes/,
  );
  assert.match(createLoginCodeSender({ isProduction: false, emailDelivery: null }).description, /console/);
  assert.match(
    createLoginCodeSender({ isProduction: true, emailDelivery: { provider: 'smtp', smtp: SMTP } }).description,
    /smtp\.gmail\.com:465/,
  );
  assert.equal(
    createLoginCodeSender({ isProduction: true, emailDelivery: { provider: 'brevo', brevo: BREVO } }).description,
    'emailed through the Brevo API',
  );
});
