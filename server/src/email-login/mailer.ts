/**
 * Delivering a sign-in code: through Brevo's HTTPS API or by SMTP, whichever
 * is configured (see `email-delivery-config.ts`), and — in development only —
 * by printing it to the server console.
 *
 * Brevo is called with Node's built-in `fetch`: one JSON POST needs no
 * client library. SMTP goes through `nodemailer`. Sending mail correctly (TLS and STARTTLS,
 * SMTP AUTH, MIME multipart, header encoding, dot-stuffing) is a protocol
 * implementation, not a few lines, and nodemailer is the long-established
 * one for Node: MIT-0 licensed, no runtime dependencies, actively released.
 */
import { createTransport } from 'nodemailer';
import type { SmtpConfig } from './smtp-config.js';
import type { BrevoConfig, EmailDelivery } from './email-delivery-config.js';

export interface LoginCodeEmail {
  to: string;
  code: string;
  expiresInMinutes: number;
}

export interface LoginCodeSender {
  /** Resolves once the message has been handed to the mail server. */
  send(email: LoginCodeEmail): Promise<void>;
  /** For the startup log: where codes go. Never contains a secret. */
  readonly description: string;
}

export interface ComposedEmail {
  subject: string;
  text: string;
  html: string;
}

export const LOGIN_CODE_SUBJECT = 'Your Class Meet sign-in code';

/**
 * Plain text first, with a minimal HTML twin for clients that prefer it. No
 * images, links or tracking: a code email that looks like marketing is more
 * likely to be filtered, and has no need to look like anything. The code is
 * digits and the minutes a number, so nothing here needs HTML escaping.
 */
export function composeLoginCodeEmail(code: string, expiresInMinutes: number): ComposedEmail {
  const expiry = `It expires in ${String(expiresInMinutes)} minutes.`;
  const ignore = "If you didn't ask for this, ignore this email.";
  return {
    subject: LOGIN_CODE_SUBJECT,
    text: [`Your Class Meet sign-in code is:`, '', code, '', expiry, '', ignore, ''].join('\n'),
    html: [
      '<!doctype html>',
      '<html lang="en"><body style="font-family: Arial, Helvetica, sans-serif; color: #1b2842;">',
      '<p>Your Class Meet sign-in code is:</p>',
      `<p style="font-size: 28px; font-weight: 700; letter-spacing: 4px;">${code}</p>`,
      `<p>${expiry}</p>`,
      `<p>${ignore}</p>`,
      '</body></html>',
    ].join('\n'),
  };
}

/** The part of a nodemailer transport this file uses, so tests can stand in for it. */
export interface MailTransport {
  sendMail(message: { from: string; to: string } & ComposedEmail): Promise<unknown>;
}

/** Hosts where STARTTLS cannot be required: a local test mail catcher speaks plaintext. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function createNodemailerTransport(config: SmtpConfig): MailTransport {
  return createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    // On a STARTTLS port, refuse to continue if the upgrade does not happen,
    // so the password and the code never cross the network in plaintext.
    requireTLS: !config.secure && !LOOPBACK_HOSTS.has(config.host),
    ...(config.auth === null ? {} : { auth: config.auth }),
    // nodemailer waits up to two minutes by default. A student is watching a
    // spinner, so fail within seconds and let them try again.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

export function createSmtpLoginCodeSender(
  config: SmtpConfig,
  transport: MailTransport = createNodemailerTransport(config),
): LoginCodeSender {
  return {
    description: `emailed through ${config.host}:${String(config.port)}`,
    async send({ to, code, expiresInMinutes }: LoginCodeEmail): Promise<void> {
      await transport.sendMail({ from: config.from, to, ...composeLoginCodeEmail(code, expiresInMinutes) });
    },
  };
}

/** Brevo's "send a transactional email" endpoint: https://developers.brevo.com/reference/sendtransacemail */
export const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';

/** As for SMTP: a student is waiting, so give up within seconds. */
const BREVO_TIMEOUT_MS = 10_000;

/** Brevo's error body is {code, message}; anything else is reported by status alone. */
async function describeBrevoRefusal(response: Response): Promise<string> {
  let detail = '';
  try {
    const body = (await response.json()) as { code?: unknown; message?: unknown };
    detail = [body.code, body.message].filter((part) => typeof part === 'string').join(': ');
  } catch {
    // Not JSON (a proxy's error page, say). The status is still worth reporting.
  }
  return `Brevo refused the email: HTTP ${String(response.status)}${detail.length > 0 ? ` (${detail.slice(0, 300)})` : ''}`;
}

/**
 * Sends through Brevo's API. A rejection, a non-2xx answer and a timeout all
 * reject with an Error whose message names the cause but never the API key
 * or the code, so the caller can log it and answer 503 email_send_failed.
 */
export function createBrevoLoginCodeSender(config: BrevoConfig, fetchImpl: typeof fetch = fetch): LoginCodeSender {
  return {
    description: 'emailed through the Brevo API',
    async send({ to, code, expiresInMinutes }: LoginCodeEmail): Promise<void> {
      const { subject, text, html } = composeLoginCodeEmail(code, expiresInMinutes);
      let response: Response;
      try {
        response = await fetchImpl(BREVO_SEND_URL, {
          method: 'POST',
          headers: { 'api-key': config.apiKey, 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({
            sender: config.sender.name === null ? { email: config.sender.email } : config.sender,
            to: [{ email: to }],
            subject,
            textContent: text,
            htmlContent: html,
          }),
          signal: AbortSignal.timeout(BREVO_TIMEOUT_MS),
        });
      } catch (error) {
        const reason = error instanceof Error && error.name === 'TimeoutError' ? 'timed out' : 'could not be reached';
        throw new Error(`The Brevo API ${reason}: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (!response.ok) throw new Error(await describeBrevoRefusal(response));
    },
  };
}

/**
 * Development without an email provider: the code is printed where the developer is
 * already looking. `createLoginCodeSender` never returns this in production,
 * and `env.ts` refuses to start production without a provider, so a code can
 * only reach a log on a developer's own machine.
 */
export function createConsoleLoginCodeSender(log: (line: string) => void = console.log): LoginCodeSender {
  return {
    description: 'printed to this console as [dev email] lines (no email provider is configured)',
    async send({ to, code, expiresInMinutes }: LoginCodeEmail): Promise<void> {
      log(`[dev email] to ${to}: Class Meet sign-in code ${code} (expires in ${String(expiresInMinutes)} minutes)`);
    },
  };
}

export function createLoginCodeSender(options: {
  isProduction: boolean;
  emailDelivery: EmailDelivery | null;
}): LoginCodeSender {
  const { emailDelivery } = options;
  if (emailDelivery?.provider === 'brevo') return createBrevoLoginCodeSender(emailDelivery.brevo);
  if (emailDelivery?.provider === 'smtp') return createSmtpLoginCodeSender(emailDelivery.smtp);
  if (options.isProduction) {
    throw new Error('Refusing to print sign-in codes to the console in production. Configure an email provider.');
  }
  return createConsoleLoginCodeSender();
}
