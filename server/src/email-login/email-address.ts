/**
 * Who may sign in with an emailed code: the rule is "you can read mail sent to
 * a UTA address". This file decides which addresses count as one, and turns
 * whatever the student typed into the one canonical form the rest of sign-in
 * uses (the codes table, the users table, the email itself).
 *
 * The domain check is an exact match on everything after the "@", never an
 * "ends with": `x@mavs.uta.edu.evil.com` and `x@evilmavs.uta.edu` are other
 * people's domains.
 *
 * Plus-addressing is STRIPPED, not rejected: `jane+cm@mavs.uta.edu` becomes
 * `jane@mavs.uta.edu`. Exchange Online delivers both to the same mailbox, so
 * keeping the tag would let one student hold any number of accounts (and dodge
 * a moderator's decision) by varying it. Stripping makes the account the
 * mailbox, and the code is sent to the canonical address that mailbox owns.
 */

/** UTA's student and staff domains. Overridable with EMAIL_LOGIN_DOMAINS. */
export const DEFAULT_EMAIL_LOGIN_DOMAINS: readonly string[] = ['mavs.uta.edu', 'uta.edu'];

/** RFC 5321's limit on a forward path. Anything longer is not a real address. */
const MAX_EMAIL_LENGTH = 254;

/**
 * Deliberately narrower than RFC 5322: UTA issues addresses made of letters,
 * digits, dots, hyphens and underscores. Refusing everything else (quotes,
 * spaces, line breaks) also means nothing typed here can ever reach an email
 * header as anything but an address.
 */
const ADDRESS_PATTERN = /^([a-z0-9._-]{1,64})(?:\+[a-z0-9._-]*)?@([a-z0-9.-]+)$/;

const DOMAIN_PATTERN = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;

/**
 * Reads EMAIL_LOGIN_DOMAINS ("mavs.uta.edu,uta.edu"). Throws on a malformed
 * entry, so a typo stops the server at startup instead of locking everyone out.
 */
export function parseEmailLoginDomains(raw: string): string[] {
  const domains = raw
    .split(',')
    .map((part) => part.trim().toLowerCase().replace(/^@/, ''))
    .filter((part) => part.length > 0);
  if (domains.length === 0) {
    throw new Error('EMAIL_LOGIN_DOMAINS must list at least one domain, e.g. "mavs.uta.edu,uta.edu".');
  }
  for (const domain of domains) {
    if (!DOMAIN_PATTERN.test(domain)) {
      throw new Error(`EMAIL_LOGIN_DOMAINS contains "${domain}", which is not a domain name.`);
    }
  }
  return domains;
}

/**
 * The canonical form of an allowed address — trimmed, lowercased, plus tag
 * removed — or null when the input is not an address at one of `allowedDomains`.
 */
export function normaliseUniversityEmail(raw: unknown, allowedDomains: readonly string[]): string | null {
  if (typeof raw !== 'string') return null;
  const candidate = raw.trim().toLowerCase();
  if (candidate.length > MAX_EMAIL_LENGTH) return null;

  const match = ADDRESS_PATTERN.exec(candidate);
  if (match === null) return null;
  const [, localPart, domain] = match;
  if (localPart === undefined || domain === undefined || !allowedDomains.includes(domain)) return null;

  return `${localPart}@${domain}`;
}

/**
 * A first name for a student who has never signed in before: "jane.doe@..."
 * becomes "Jane Doe". Microsoft sign-in got a real name from the directory;
 * an emailed code proves only the address, so this is the best available
 * until the student can set their own.
 */
export function displayNameFromEmail(email: string): string {
  const localPart = email.slice(0, email.indexOf('@'));
  const words = localPart.split(/[._-]+/).filter((word) => word.length > 0);
  if (words.length === 0) return localPart;
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}
