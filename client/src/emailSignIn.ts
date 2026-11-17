/**
 * The sign-in form's rules, kept out of the component so they can be tested
 * on their own. The server applies the real rule (see
 * server/src/email-login/email-address.ts); this one exists to answer
 * "that is not a UTA address" without a round trip, with the domain list the
 * server sends in /api/auth/config.
 */

export const LOGIN_CODE_DIGITS = 6;

/** "…@mavs.uta.edu or …@uta.edu". */
function domainExamples(domains: readonly string[]): string {
  return domains.map((domain) => `…@${domain}`).join(' or ');
}

/**
 * What is wrong with the typed address, or null when it may be sent. With no
 * domain list (the server could not be reached), only emptiness is checked:
 * the request itself will then say what is wrong.
 */
export function emailProblem(typed: string, domains: readonly string[] | null): string | null {
  const email = typed.trim().toLowerCase();
  if (email.length === 0) return 'Enter your UTA email address.';
  if (domains === null || domains.length === 0) return null;

  const at = email.lastIndexOf('@');
  const domain = at === -1 ? '' : email.slice(at + 1);
  if (at <= 0 || !domains.includes(domain)) {
    return `Use your UTA email (${domainExamples(domains)}).`;
  }
  return null;
}

/** The code as six digits, forgiving the spaces and hyphens people paste, or null. */
export function typedCode(typed: string): string | null {
  const digits = typed.replace(/[\s-]/g, '');
  return new RegExp(`^\\d{${String(LOGIN_CODE_DIGITS)}}$`).test(digits) ? digits : null;
}

/** 75 -> "1:15", for the resend countdown. */
export function formatCountdown(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(whole / 60))}:${String(whole % 60).padStart(2, '0')}`;
}
