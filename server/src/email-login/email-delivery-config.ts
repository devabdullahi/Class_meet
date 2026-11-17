/**
 * How sign-in codes are delivered: which provider, and its settings.
 *
 *   EMAIL_PROVIDER=brevo  Brevo's transactional email API, over HTTPS.
 *                         Needs BREVO_API_KEY and EMAIL_FROM.
 *   EMAIL_PROVIDER=smtp   Any SMTP server (see `smtp-config.ts`).
 *                         Needs SMTP_HOST and EMAIL_FROM, usually SMTP_USER/PASS.
 *
 * WHY TWO. SMTP works with any provider, but some hosts block it: Render's
 * free web services cannot open connections to ports 25, 465 or 587. An HTTPS
 * API goes out on port 443 like any web request, so Brevo's API works there.
 *
 * EMAIL_PROVIDER may be left out when only one provider's settings are
 * present. Settings for both, or for a provider that was not chosen, are
 * refused rather than guessed between: exactly one complete configuration, or
 * none at all (development only — codes are then printed to the console).
 */
import { readSmtpConfig, SMTP_VARIABLES, type SmtpConfig } from './smtp-config.js';

export interface BrevoConfig {
  apiKey: string;
  /** Must be a sender address verified in the Brevo account. */
  sender: { name: string | null; email: string };
}

export type EmailDelivery = { provider: 'smtp'; smtp: SmtpConfig } | { provider: 'brevo'; brevo: BrevoConfig };

type Source = Readonly<Record<string, string | undefined>>;

const PROVIDERS = ['smtp', 'brevo'] as const;

/** What to set, for the startup error when production has no provider. */
export const EMAIL_DELIVERY_HELP =
  'Set EMAIL_PROVIDER=brevo with BREVO_API_KEY and EMAIL_FROM, or EMAIL_PROVIDER=smtp with ' +
  'SMTP_HOST, SMTP_USER, SMTP_PASS and EMAIL_FROM (see docs/DEPLOY.md, "Set up sending sign-in emails").';

function read(source: Source, name: string): string {
  return source[name]?.trim() ?? '';
}

/** "Class Meet <a@b.org>" or "a@b.org" -> name and address. Null when it is neither. */
export function parseFromAddress(raw: string): { name: string | null; email: string } | null {
  const named = /^(.*?)\s*<([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)>$/.exec(raw);
  if (named !== null) {
    const name = named[1]?.trim().replace(/^"(.*)"$/, '$1') ?? '';
    return { name: name.length > 0 ? name : null, email: named[2] ?? '' };
  }
  return /^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/.test(raw) ? { name: null, email: raw } : null;
}

function readBrevoConfig(source: Source): BrevoConfig {
  const apiKey = read(source, 'BREVO_API_KEY');
  const from = read(source, 'EMAIL_FROM');
  const missing = [apiKey.length === 0 ? 'BREVO_API_KEY' : null, from.length === 0 ? 'EMAIL_FROM' : null].filter(
    (name): name is string => name !== null,
  );
  if (missing.length > 0) {
    throw new Error(`EMAIL_PROVIDER=brevo needs ${missing.join(' and ')}. ${EMAIL_DELIVERY_HELP}`);
  }
  const sender = parseFromAddress(from);
  if (sender === null) {
    throw new Error(`EMAIL_FROM must be an address, e.g. "Class Meet <you@example.com>", got "${from}".`);
  }
  return { apiKey, sender };
}

function readSmtpDelivery(source: Source): SmtpConfig {
  const smtp = readSmtpConfig(source);
  if (smtp === null) {
    throw new Error(`EMAIL_PROVIDER=smtp needs SMTP_HOST. ${EMAIL_DELIVERY_HELP}`);
  }
  return smtp;
}

/** The configured provider, or null when none is. Throws on an ambiguous or incomplete set. */
export function readEmailDelivery(source: Source): EmailDelivery | null {
  const chosen = read(source, 'EMAIL_PROVIDER').toLowerCase();
  const smtpSet = SMTP_VARIABLES.filter((name) => read(source, name).length > 0);
  const brevoSet = read(source, 'BREVO_API_KEY').length > 0;

  if (chosen.length > 0 && !(PROVIDERS as readonly string[]).includes(chosen)) {
    throw new Error(`EMAIL_PROVIDER must be "brevo" or "smtp", got "${chosen}".`);
  }

  const provider = chosen.length > 0 ? chosen : brevoSet ? 'brevo' : smtpSet.length > 0 ? 'smtp' : null;
  if (provider === null) {
    // Nothing chosen and no provider settings: "not configured". EMAIL_FROM
    // alone is allowed, so it can be filled in ahead of the rest.
    return null;
  }

  if (provider === 'brevo' && smtpSet.length > 0) {
    throw new Error(
      `${smtpSet.join(', ')} ${smtpSet.length === 1 ? 'is' : 'are'} set, but email goes through Brevo. ` +
        'Remove the SMTP settings, or set EMAIL_PROVIDER=smtp and remove BREVO_API_KEY.',
    );
  }
  if (provider === 'smtp' && brevoSet) {
    throw new Error(
      'BREVO_API_KEY is set, but email goes through SMTP. Remove BREVO_API_KEY, or set ' +
        'EMAIL_PROVIDER=brevo and remove the SMTP settings.',
    );
  }

  return provider === 'brevo'
    ? { provider: 'brevo', brevo: readBrevoConfig(source) }
    : { provider: 'smtp', smtp: readSmtpDelivery(source) };
}
