/**
 * Counting requests per key (a client address, an email address) in fixed
 * windows, to slow down guessing and abuse of the sign-in endpoints.
 *
 * Kept in this process's memory, deliberately: Class Meet runs as one Node
 * process (see docs/DEPLOY.md), so one process sees every request, and an
 * in-memory map needs no extra service. A deployment with several instances
 * would give each its own count, so these limits would loosen by that factor.
 * The protections that must hold regardless — five tries per code, one code
 * per address per minute — live in the database instead (see
 * `email-login/repository.ts`), and these limits are the layer in front.
 *
 * A fixed window can let up to twice `max` through around a window boundary.
 * For limits whose job is "make guessing impractical", that is fine, and it
 * keeps the arithmetic obvious.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { HttpError } from '../errors.js';

export interface RateLimitRule {
  /** Requests allowed per key in each window. */
  max: number;
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Whole seconds until the key's window ends. Meaningful when refused. */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  /** Counts one request for `key` and says whether it may proceed. */
  consume(key: string): RateLimitDecision;
  /** Keys currently tracked. For tests of the memory bound. */
  size(): number;
}

/**
 * Past this many keys, finished windows are swept on the next request. A
 * flood from many addresses then costs memory only for the keys still inside
 * their window, never for every key ever seen.
 */
const SWEEP_THRESHOLD = 10_000;

interface Window {
  count: number;
  endsAt: number;
}

export function createRateLimiter(rule: RateLimitRule, now: () => number = Date.now): RateLimiter {
  const windows = new Map<string, Window>();

  function sweepFinishedWindows(at: number): void {
    for (const [key, window] of windows) {
      if (window.endsAt <= at) windows.delete(key);
    }
  }

  return {
    consume(key: string): RateLimitDecision {
      const at = now();
      if (windows.size >= SWEEP_THRESHOLD) sweepFinishedWindows(at);

      let window = windows.get(key);
      if (window === undefined || window.endsAt <= at) {
        window = { count: 0, endsAt: at + rule.windowMs };
        windows.set(key, window);
      }
      window.count += 1;
      return {
        allowed: window.count <= rule.max,
        retryAfterSeconds: Math.ceil((window.endsAt - at) / 1000),
      };
    },
    size: () => windows.size,
  };
}

/** Counts a request for `key`, and throws a 429 when the key is over its limit. */
export function enforceRateLimit(limiter: RateLimiter, key: string, message: string): void {
  const decision = limiter.consume(key);
  if (!decision.allowed) {
    throw HttpError.tooManyRequests('too_many_requests', message, decision.retryAfterSeconds);
  }
}

/**
 * Limits requests per client address. `req.ip` is the address Express derives
 * with `trust proxy` set to one hop (see app.ts), so a client cannot pick a
 * new identity per request by sending its own X-Forwarded-For.
 */
export function limitByClientIp(limiter: RateLimiter, message: string): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      enforceRateLimit(limiter, req.ip ?? 'unknown', message);
      next();
    } catch (error) {
      next(error);
    }
  };
}
