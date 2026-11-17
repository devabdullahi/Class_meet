/**
 * Delivering a sign-in code: by SMTP when it is configured, and — in
 * development only — by printing it to the server console.
 *
 * SMTP goes through `nodemailer`. Sending mail correctly (TLS and STARTTLS,
 * SMTP AUTH, MIME multipart, header encoding, dot-stuffing) is a protocol
 * implementation, not a few lines, and nodemailer is the long-established
 * one for Node: MIT-0 licensed, no runtime dependencies, actively released.
 */
import { createTransport } from 'nodemailer';
import type { SmtpConfig } from './smtp-config.js';

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

/**
 * Development without SMTP: the code is printed where the developer is
 * already looking. `createLoginCodeSender` never returns this in production,
 * and `env.ts` refuses to start production without SMTP, so a code can only
 * reach a log on a developer's own machine.
 */
export function createConsoleLoginCodeSender(log: (line: string) => void = console.log): LoginCodeSender {
  return {
    description: 'printed to this console as [dev email] lines (SMTP is not configured)',
    async send({ to, code, expiresInMinutes }: LoginCodeEmail): Promise<void> {
      log(`[dev email] to ${to}: Class Meet sign-in code ${code} (expires in ${String(expiresInMinutes)} minutes)`);
    },
  };
}

export function createLoginCodeSender(options: { isProduction: boolean; smtp: SmtpConfig | null }): LoginCodeSender {
  if (options.smtp !== null) return createSmtpLoginCodeSender(options.smtp);
  if (options.isProduction) {
    throw new Error('Refusing to print sign-in codes to the console in production. Configure SMTP_HOST and EMAIL_FROM.');
  }
  return createConsoleLoginCodeSender();
}
