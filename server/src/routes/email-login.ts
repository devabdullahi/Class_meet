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
 *    hour (per address and per client address, below);
 *  - ten minutes to use it, once.
 * At five guesses for each of six codes an hour, an attacker trying one
 * address gets 30 guesses an hour at one-in-a-million odds each.
 *
 * NO ACCOUNT ENUMERATION. `start` never looks at the users table: every
 * allowed address gets the same answer and the same email whether or not it
 * has ever signed in, and the account is found or created only after a
 * correct code. The only addresses refused are those outside UTA's domains,
 * which says nothing about who has an account.
 *
 * Both endpoints sit under the CSRF guard in app.ts like every other write.
 */
import { Router, type Request, type Response } from 'express';
import { HttpError } from '../errors.js';
import { env } from '../env.js';
import { createSessionToken, setSessionCookie } from '../session.js';
import { createRateLimiter, enforceRateLimit, limitByClientIp, type RateLimiter } from '../middleware/rate-limit.js';
import { displayNameFromEmail, normaliseUniversityEmail } from '../email-login/email-address.js';
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

/**
 * Per client address, the limits are generous on purpose: a lecture hall on
 * campus Wi-Fi can reach us from a handful of NAT addresses, and thirty
 * students signing in at the start of class must not lock each other out.
 * Per email address they are tight, because one person needs very few codes.
 */
export const EMAIL_LOGIN_RATE_LIMITS = {
  startPerClient: { max: 30, windowMs: 15 * MINUTE_MS },
  startPerEmail: { max: 6, windowMs: 60 * MINUTE_MS },
  verifyPerClient: { max: 60, windowMs: 15 * MINUTE_MS },
  verifyPerEmail: { max: 15, windowMs: 15 * MINUTE_MS },
} as const;

export interface EmailLoginLimiters {
  startPerClient: RateLimiter;
  startPerEmail: RateLimiter;
  verifyPerClient: RateLimiter;
  verifyPerEmail: RateLimiter;
}

export function createEmailLoginLimiters(): EmailLoginLimiters {
  return {
    startPerClient: createRateLimiter(EMAIL_LOGIN_RATE_LIMITS.startPerClient),
    startPerEmail: createRateLimiter(EMAIL_LOGIN_RATE_LIMITS.startPerEmail),
    verifyPerClient: createRateLimiter(EMAIL_LOGIN_RATE_LIMITS.verifyPerClient),
    verifyPerEmail: createRateLimiter(EMAIL_LOGIN_RATE_LIMITS.verifyPerEmail),
  };
}

export interface EmailLoginRouterOptions {
  repository: EmailLoginRepository;
  sender: LoginCodeSender;
  /** Fresh limiters by default. Tests pass their own to reach a limit quickly. */
  limiters?: EmailLoginLimiters;
}

/** What a successful `start` answers, for every allowed address alike. */
export interface CodeSentResponse {
  /** The address the code went to, as normalised (plus tag removed). */
  email: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
}

const TOO_MANY_MESSAGE = 'Too many sign-in attempts. Wait a few minutes, then try again.';

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

function codeExpired(): HttpError {
  return HttpError.badRequest('code_expired', 'That code has expired or has already been used. Send yourself a new code.');
}

export function createEmailLoginRouter(options: EmailLoginRouterOptions): Router {
  const { repository, sender } = options;
  const limiters = options.limiters ?? createEmailLoginLimiters();
  const router = Router();

  router.post('/start', limitByClientIp(limiters.startPerClient, TOO_MANY_MESSAGE), async (req: Request, res: Response) => {
    const email = readEmail(req.body);
    enforceRateLimit(limiters.startPerEmail, email, TOO_MANY_MESSAGE);

    // Housekeeping: without it, codes nobody used would stay forever.
    await repository.deleteExpiredCodes();

    const code = generateLoginCode();
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

    try {
      await sender.send({ to: email, code, expiresInMinutes: CODE_TTL_SECONDS / 60 });
    } catch (error) {
      // Withdraw the code nobody received, so the student can retry at once
      // instead of waiting out the resend cooldown. Logged without the code
      // or the address: the mail server's reason is what an operator needs.
      await repository.deleteCode(email, codeHash);
      console.error('[auth] could not send a sign-in code:', error instanceof Error ? error.message : error);
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
    enforceRateLimit(limiters.verifyPerEmail, email, TOO_MANY_MESSAGE);

    const attempt = await repository.countAttempt(email, MAX_CODE_ATTEMPTS);
    if (attempt === null) throw codeExpired();

    if (!loginCodeMatches(email, code, attempt.codeHash, env.sessionSecret)) {
      const triesLeft = MAX_CODE_ATTEMPTS - attempt.attempts;
      if (triesLeft === 0) {
        throw HttpError.badRequest(
          'code_used_up',
          'That code is not right, and it was the last try. Send yourself a new code.',
        );
      }
      throw HttpError.badRequest(
        'code_incorrect',
        `That code is not right. You have ${String(triesLeft)} ${triesLeft === 1 ? 'try' : 'tries'} left.`,
      );
    }

    // Single use: of two requests racing with the same correct code, only
    // the one whose delete removed the row gets a session.
    if (!(await repository.deleteCode(email, attempt.codeHash))) throw codeExpired();

    const user = await repository.findOrCreateUserByEmail(email, displayNameFromEmail(email));
    setSessionCookie(res, createSessionToken({ userId: user.id, providerObjectId: EMAIL_SESSION_PROVIDER_ID }));
    res.status(200).json({ user });
  });

  return router;
}
