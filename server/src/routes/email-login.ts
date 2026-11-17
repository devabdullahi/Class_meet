/**
 * Sign-in with a one-time code emailed to a UTA address.
 *
 *   POST /api/auth/email/start   { email }        -> email a code
 *   POST /api/auth/email/verify  { email, code }  -> check it, set the session cookie
 *
 * A correct code issues exactly the session Microsoft sign-in issued (see
 * `src/session.ts`), so everything after sign-in is unchanged.
 *
 * WHAT KEEPS A SIX-DIGIT CODE SAFE. A million possible codes is a small
 * space; it is the limits around it that make guessing hopeless:
 *  - five guesses per code, counted in the database, then the code is dead;
 *  - one live code per address, at most one new code a minute, and a few an
 *    hour per address;
 *  - ten minutes to use it, once.
 * At five guesses for each of six codes an hour, an attacker trying one
 * address gets 30 guesses an hour at one-in-a-million odds each.
 *
 * WHAT KEEPS THE LIMITS FROM BEING A WEAPON. A limit keyed by someone else's
 * address lets a stranger lock its owner out, so the per-address limit counts
 * only codes actually sent (each of which lands in the owner's inbox), and
 * there is no per-address limit on guesses at all: each code's own five tries
 * already bound them. The global caps on emails sent protect the mail
 * provider's daily allowance, which would otherwise be one attacker away from
 * stopping every sign-in.
 *
 * NOTHING ABOUT ACCOUNTS OR CODES LEAKS. `start` never looks at the users
 * table and answers every allowed address alike. `verify` gives the same
 * answer to a wrong code, an expired or used-up one, and an address that was
 * never sent one, so it cannot be used to learn who asked for a code.
 *
 * Both endpoints sit under the CSRF guard in app.ts like every other write.
 */
import { Router, type Request, type Response } from 'express';
import { HttpError } from '../errors.js';
import { env } from '../env.js';
import { createSessionToken, setSessionCookie } from '../session.js';
import { createRateLimiter, enforceRateLimit, limitByClientIp, type RateLimiter } from '../middleware/rate-limit.js';
import { displayNameFromEmail, normaliseUniversityEmail, redactEmailAddresses } from '../email-login/email-address.js';
import { generateLoginCode, hashLoginCode, loginCodeMatches, readSubmittedCode } from '../email-login/login-code.js';
import type { EmailLoginRepository } from '../email-login/repository.js';
import type { LoginCodeSender } from '../email-login/mailer.js';

export const CODE_TTL_SECONDS = 10 * 60;
export const RESEND_COOLDOWN_SECONDS = 60;
export const MAX_CODE_ATTEMPTS = 5;

/**
 * Recorded in the session in place of a directory object ID, so a session
 * says how it was obtained.
 */
export const EMAIL_SESSION_PROVIDER_ID = 'email-code';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * Per client address: ten codes in fifteen minutes is far more than one
 * person needs, and still lets a few students behind one campus NAT sign in
 * together; it mainly stops one client spraying codes at many inboxes.
 * Per email address: counted only when a code is sent. Globally: the
 * EMAIL_SENDS_PER_HOUR / EMAIL_SENDS_PER_DAY caps, below the provider's own.
 */
export const EMAIL_LOGIN_RATE_LIMITS = {
  startPerClient: { max: 10, windowMs: 15 * MINUTE_MS },
  startPerEmail: { max: 6, windowMs: HOUR_MS },
  verifyPerClient: { max: 60, windowMs: 15 * MINUTE_MS },
  sendsPerHour: { max: env.emailSendsPerHour, windowMs: HOUR_MS },
  sendsPerDay: { max: env.emailSendsPerDay, windowMs: 24 * HOUR_MS },
} as const;

export interface EmailLoginLimiters {
  startPerClient: RateLimiter;
  startPerEmail: RateLimiter;
  verifyPerClient: RateLimiter;
  sendsPerHour: RateLimiter;
  sendsPerDay: RateLimiter;
}

export function createEmailLoginLimiters(): EmailLoginLimiters {
  return {
    startPerClient: createRateLimiter(EMAIL_LOGIN_RATE_LIMITS.startPerClient),
    startPerEmail: createRateLimiter(EMAIL_LOGIN_RATE_LIMITS.startPerEmail),
    verifyPerClient: createRateLimiter(EMAIL_LOGIN_RATE_LIMITS.verifyPerClient),
    sendsPerHour: createRateLimiter(EMAIL_LOGIN_RATE_LIMITS.sendsPerHour),
    sendsPerDay: createRateLimiter(EMAIL_LOGIN_RATE_LIMITS.sendsPerDay),
  };
}

export interface EmailLoginRouterOptions {
  repository: EmailLoginRepository;
  sender: LoginCodeSender;
  /** Fresh limiters by default. Tests pass their own to reach a limit quickly. */
  limiters?: EmailLoginLimiters;
  /** `generateLoginCode` by default. Tests pass known codes. */
  generateCode?: () => string;
}

/** What a successful `start` answers, for every allowed address alike. */
export interface CodeSentResponse {
  /** The address the code went to, as normalised (plus tag removed). */
  email: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
}

const TOO_MANY_MESSAGE = 'Too many sign-in attempts. Wait a few minutes, then try again.';

/** The one key the global send caps count under. */
const ALL_SENDS = 'all';

function readEmail(body: unknown): string {
  const raw = typeof body === 'object' && body !== null ? (body as Record<string, unknown>)['email'] : undefined;
  const email = normaliseUniversityEmail(raw, env.emailLoginDomains);
  if (email === null) {
    const examples = env.emailLoginDomains.map((domain) => `@${domain}`).join(' or ');
    throw HttpError.badRequest('email_not_allowed', `Use your UTA email address, ending in ${examples}.`);
  }
  return email;
}

function readCode(body: unknown): string {
  const raw = typeof body === 'object' && body !== null ? (body as Record<string, unknown>)['code'] : undefined;
  const code = readSubmittedCode(raw);
  if (code === null) {
    throw HttpError.badRequest('code_invalid', 'Enter the 6-digit code from the email.');
  }
  return code;
}

/** The single answer for every code that does not sign in (see the header comment). */
function codeRejected(): HttpError {
  return HttpError.badRequest('code_rejected', "That code didn't work. Check the newest email or ask for a new code.");
}

/**
 * Refuses to send when either global cap is reached. Logged as a warning an
 * operator will notice — with no address, since the cause is the volume.
 */
function enforceSendCaps(limiters: EmailLoginLimiters): void {
  for (const [period, limiter] of [
    ['hour', limiters.sendsPerHour],
    ['day', limiters.sendsPerDay],
  ] as const) {
    if (!limiter.check(ALL_SENDS).allowed) {
      console.warn(
        `[auth] SIGN-IN EMAIL LIMIT REACHED: the per-${period} cap on codes sent is used up, so no ` +
          'sign-in emails go out until it resets. If this is real demand, raise EMAIL_SENDS_PER_HOUR / ' +
          'EMAIL_SENDS_PER_DAY within your email provider\'s allowance; if not, someone is requesting codes in bulk.',
      );
      throw HttpError.serviceUnavailable(
        'email_temporarily_unavailable',
        'Class Meet has sent a lot of sign-in emails in a short time and has paused sending. Please try again later.',
      );
    }
  }
}

export function createEmailLoginRouter(options: EmailLoginRouterOptions): Router {
  const { repository, sender } = options;
  const limiters = options.limiters ?? createEmailLoginLimiters();
  const generateCode = options.generateCode ?? generateLoginCode;
  const router = Router();

  router.post('/start', limitByClientIp(limiters.startPerClient, TOO_MANY_MESSAGE), async (req: Request, res: Response) => {
    const email = readEmail(req.body);
    // Checked now, counted only once a code is really issued below: a request
    // refused for being too soon must not use up its owner's allowance.
    const perEmail = limiters.startPerEmail.check(email);
    if (!perEmail.allowed) {
      throw HttpError.tooManyRequests('too_many_requests', TOO_MANY_MESSAGE, perEmail.retryAfterSeconds);
    }
    enforceSendCaps(limiters);

    // Housekeeping: without it, codes nobody used would stay forever.
    await repository.deleteExpiredCodes();

    const code = generateCode();
    const codeHash = hashLoginCode(email, code, env.sessionSecret);
    const issued = await repository.issueCode(email, codeHash, {
      ttlSeconds: CODE_TTL_SECONDS,
      resendCooldownSeconds: RESEND_COOLDOWN_SECONDS,
    });
    if (issued.outcome === 'too_soon') {
      throw HttpError.tooManyRequests(
        'resend_too_soon',
        'We just sent a code to this address. Check your inbox, or ask for another one shortly.',
        issued.retryAfterSeconds,
      );
    }

    limiters.startPerEmail.consume(email);
    limiters.sendsPerHour.consume(ALL_SENDS);
    limiters.sendsPerDay.consume(ALL_SENDS);

    try {
      await sender.send({ to: email, code, expiresInMinutes: CODE_TTL_SECONDS / 60 });
    } catch (error) {
      // Withdraw the code nobody received, so the student can retry at once
      // instead of waiting out the resend cooldown. The provider's reason is
      // what an operator needs, but providers quote the recipient (and often
      // the sender) in it, so addresses are redacted; the code never appears.
      await repository.deleteCode(email, codeHash);
      const reason = error instanceof Error ? error.message : String(error);
      console.error('[auth] could not send a sign-in code:', redactEmailAddresses(reason));
      throw HttpError.serviceUnavailable(
        'email_send_failed',
        'We could not send the email just now. Try again in a minute.',
      );
    }

    res.status(200).json({
      email,
      expiresInSeconds: CODE_TTL_SECONDS,
      resendAfterSeconds: RESEND_COOLDOWN_SECONDS,
    } satisfies CodeSentResponse);
  });

  router.post('/verify', limitByClientIp(limiters.verifyPerClient, TOO_MANY_MESSAGE), async (req: Request, res: Response) => {
    const email = readEmail(req.body);
    const code = readCode(req.body);

    // Counts this guess against the address's live code, if there is one.
    // Whatever the reason a code fails — none sent, expired, used up, wrong —
    // the answer is the same.
    const attempt = await repository.countAttempt(email, MAX_CODE_ATTEMPTS);
    if (attempt === null || !loginCodeMatches(email, code, attempt.codeHash, env.sessionSecret)) {
      throw codeRejected();
    }

    // Single use: of two requests racing with the same correct code, only
    // the one whose delete removed the row gets a session.
    if (!(await repository.deleteCode(email, attempt.codeHash))) throw codeRejected();

    const user = await repository.findOrCreateUserByEmail(email, displayNameFromEmail(email));
    setSessionCookie(res, createSessionToken({ userId: user.id, providerObjectId: EMAIL_SESSION_PROVIDER_ID }));
    res.status(200).json({ user });
  });

  return router;
}
