import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { errorHandler } from './error-handler.js';
import { createRateLimiter, enforceRateLimit, limitByClientIp } from './rate-limit.js';
import { HttpError } from '../errors.js';

/** A clock the test moves by hand. */
function manualClock(start = 1_000_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

test('allows up to the limit in a window, then refuses with the time left', () => {
  const clock = manualClock();
  const limiter = createRateLimiter({ max: 3, windowMs: 60_000 }, clock.now);

  assert.equal(limiter.consume('a').allowed, true);
  assert.equal(limiter.consume('a').allowed, true);
  assert.equal(limiter.consume('a').allowed, true);
  clock.advance(15_000);
  assert.deepEqual(limiter.consume('a'), { allowed: false, retryAfterSeconds: 45 });
});

test('counts each key on its own', () => {
  const limiter = createRateLimiter({ max: 1, windowMs: 60_000 }, manualClock().now);
  assert.equal(limiter.consume('a').allowed, true);
  assert.equal(limiter.consume('b').allowed, true);
  assert.equal(limiter.consume('a').allowed, false);
});

test('starts counting again once the window has passed', () => {
  const clock = manualClock();
  const limiter = createRateLimiter({ max: 1, windowMs: 60_000 }, clock.now);
  assert.equal(limiter.consume('a').allowed, true);
  assert.equal(limiter.consume('a').allowed, false);
  clock.advance(60_000);
  assert.equal(limiter.consume('a').allowed, true);
});

test('forgets finished windows once it holds many keys, so memory stays bounded', () => {
  const clock = manualClock();
  const limiter = createRateLimiter({ max: 1, windowMs: 1_000 }, clock.now);
  for (let index = 0; index < 20_000; index += 1) limiter.consume(`ip-${String(index)}`);
  clock.advance(1_000);
  limiter.consume('one-more');
  assert.equal(limiter.size(), 1);
});

test('enforceRateLimit throws a 429 carrying the wait', () => {
  const limiter = createRateLimiter({ max: 0, windowMs: 30_000 }, manualClock().now);
  assert.throws(
    () => enforceRateLimit(limiter, 'key', 'Slow down.'),
    (error: unknown) =>
      error instanceof HttpError &&
      error.status === 429 &&
      error.code === 'too_many_requests' &&
      error.message === 'Slow down.' &&
      error.retryAfterSeconds === 30,
  );
});

let server: Server;
let baseUrl: string;

before(async () => {
  const app = express();
  app.post('/limited', limitByClientIp(createRateLimiter({ max: 2, windowMs: 60_000 }), 'Too many.'), (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
});

test('limitByClientIp answers 429 with Retry-After once one address has used its allowance', async () => {
  const statuses: number[] = [];
  let last: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    last = await fetch(`${baseUrl}/limited`, { method: 'POST' });
    statuses.push(last.status);
  }
  assert.deepEqual(statuses, [200, 200, 429]);
  assert.equal(last?.headers.get('retry-after'), '60');
  const body = (await last?.json()) as { error: { code: string } };
  assert.equal(body.error.code, 'too_many_requests');
});
