/**
 * The one-time sign-in code: making one, and checking one without ever
 * storing it.
 *
 * WHY HMAC AND NOT A PASSWORD HASH. A six-digit code has only a million
 * values, so any unkeyed hash of it — scrypt and bcrypt included — is
 * reversed by trying them all, in seconds for a fast hash and minutes for a
 * slow one. A keyed HMAC cannot be: without the key, a copy of the codes table
 * (a leaked backup, a stray `SELECT *` in a log) tells an attacker nothing.
 * The key is derived from SESSION_SECRET, which already guards every session;
 * whoever holds it can mint sessions directly and has no need for codes.
 *
 * The address is part of what is hashed, so a hash is only ever valid for the
 * row it was written to.
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export const LOGIN_CODE_DIGITS = 6;

const CODE_PATTERN = new RegExp(`^\\d{${String(LOGIN_CODE_DIGITS)}}$`);

/**
 * Separates this use of SESSION_SECRET from its other one (signing session
 * JWTs), so the two can never be confused for each other.
 */
const KEY_PURPOSE = 'class-meet/email-login-code/v1';

/** Uniformly random over 000000–999999, from the operating system's CSPRNG. */
export function generateLoginCode(): string {
  return String(randomInt(0, 10 ** LOGIN_CODE_DIGITS)).padStart(LOGIN_CODE_DIGITS, '0');
}

function codeKey(secret: string): Buffer {
  return createHmac('sha256', secret).update(KEY_PURPOSE).digest();
}

/** Hex HMAC-SHA256 of the address and the code. What the codes table stores. */
export function hashLoginCode(email: string, code: string, secret: string): string {
  return createHmac('sha256', codeKey(secret)).update(`${email}\n${code}`).digest('hex');
}

/**
 * Whether `code` is the one whose hash was stored. The comparison takes the
 * same time wherever the two hashes first differ, so response timing cannot
 * be used to learn the stored hash a byte at a time.
 */
export function loginCodeMatches(email: string, code: string, storedHash: string, secret: string): boolean {
  const expected = Buffer.from(storedHash, 'hex');
  const actual = Buffer.from(hashLoginCode(email, code, secret), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * What the student typed, as six digits, or null. Spaces and hyphens are
 * dropped because people copy codes as "123 456" or "123-456".
 */
export function readSubmittedCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/[\s-]/g, '');
  return CODE_PATTERN.test(digits) ? digits : null;
}
