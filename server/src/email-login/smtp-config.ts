/**
 * Reading the outgoing-mail settings (SMTP_HOST, SMTP_PORT, SMTP_SECURE,
 * SMTP_USER, SMTP_PASS, EMAIL_FROM).
 *
 * Plain SMTP on purpose: every mail provider speaks it, so switching from a
 * Gmail account to Brevo or a university relay is a change of five values,
 * not of code. All blank means "not configured", which development allows
 * (codes are printed to the console instead) and production refuses — see
 * `env.ts`. Half-configured is always an error at startup, because the
 * alternative is a server that boots fine and then fails every sign-in.
 */

export interface SmtpConfig {
  host: string;
  port: number;
  /**
   * True for implicit TLS from the first byte (port 465). False means the
   * connection starts in plaintext and must upgrade with STARTTLS (port 587).
   */
  secure: boolean;
  /** Null for a relay that accepts mail without signing in. */
  auth: { user: string; pass: string } | null;
  /** The From header, e.g. `Class Meet <classmeet.uta@gmail.com>`. */
  from: string;
}

const SMTP_VARIABLES = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM'] as const;

const IMPLICIT_TLS_PORT = 465;
const SUBMISSION_PORT = 587;

function read(source: Readonly<Record<string, string | undefined>>, name: string): string {
  return source[name]?.trim() ?? '';
}

function readSecure(raw: string): boolean | null {
  if (raw.length === 0) return null;
  const lowered = raw.toLowerCase();
  if (lowered === 'true') return true;
  if (lowered === 'false') return false;
  throw new Error(`SMTP_SECURE must be "true" or "false", got "${raw}".`);
}

function readPort(raw: string, secure: boolean | null): number {
  if (raw.length === 0) return secure === false ? SUBMISSION_PORT : IMPLICIT_TLS_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`SMTP_PORT must be a port number, got "${raw}".`);
  }
  return port;
}

/** The SMTP settings, or null when none are set. Throws on a partial or malformed set. */
export function readSmtpConfig(source: Readonly<Record<string, string | undefined>>): SmtpConfig | null {
  const host = read(source, 'SMTP_HOST');
  if (host.length === 0) {
    const stray = SMTP_VARIABLES.filter((name) => read(source, name).length > 0);
    if (stray.length > 0) {
      throw new Error(`${stray.join(', ')} ${stray.length === 1 ? 'is' : 'are'} set but SMTP_HOST is empty. Set SMTP_HOST too, or clear them.`);
    }
    return null;
  }

  const explicitSecure = readSecure(read(source, 'SMTP_SECURE'));
  const port = readPort(read(source, 'SMTP_PORT'), explicitSecure);
  const secure = explicitSecure ?? port === IMPLICIT_TLS_PORT;

  const user = read(source, 'SMTP_USER');
  const pass = read(source, 'SMTP_PASS');
  if ((user.length === 0) !== (pass.length === 0)) {
    throw new Error('Set both SMTP_USER and SMTP_PASS, or neither (for a relay that needs no sign-in).');
  }

  const from = read(source, 'EMAIL_FROM');
  if (from.length === 0) {
    throw new Error('EMAIL_FROM is required with SMTP_HOST, e.g. EMAIL_FROM="Class Meet <you@gmail.com>".');
  }
  // A line break here would let the value add headers of its own.
  if (/[\r\n]/.test(from)) {
    throw new Error('EMAIL_FROM must be a single line.');
  }

  return { host, port, secure, auth: user.length === 0 ? null : { user, pass }, from };
}
