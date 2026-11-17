import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { HttpError } from '../errors.js';
import { errorHandler } from './error-handler.js';

let server: Server;
let baseUrl: string;

before(async () => {
  const app = express();
  // The same body parsing app.ts sets up, with a small limit to test against.
  app.use(express.json({ limit: '1kb' }));
  app.post('/echo', (req, res) => {
    res.json(req.body);
  });
  app.post('/refused', () => {
    throw HttpError.conflict('group_full', 'This group is full.');
  });
  app.post('/slow-down', () => {
    throw HttpError.tooManyRequests('too_many_requests', 'Too many tries. Wait a minute.', 61);
  });
  app.post('/broken', () => {
    throw new Error('database password is hunter2');
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

async function post(path: string, body: string): Promise<{ status: number; json: any; retryAfter: string | null }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
  return { status: response.status, json: await response.json(), retryAfter: response.headers.get('retry-after') };
}

test('an HttpError is answered with its own status, code and message', async () => {
  assert.deepEqual(await post('/refused', '{}'), {
    status: 409,
    json: { error: { code: 'group_full', message: 'This group is full.' } },
    retryAfter: null,
  });
});

test('a body that is not valid JSON is the client\'s mistake: 400 invalid_json', async () => {
  const { status, json } = await post('/echo', '{"name": ');
  assert.equal(status, 400);
  assert.equal(json.error.code, 'invalid_json');
});

test('a body over the size limit is 413 payload_too_large', async () => {
  const { status, json } = await post('/echo', JSON.stringify({ goal: 'x'.repeat(2000) }));
  assert.equal(status, 413);
  assert.equal(json.error.code, 'payload_too_large');
});

test('any other error is a generic 500 that reveals nothing about it', async () => {
  const { status, json } = await post('/broken', '{}');
  assert.equal(status, 500);
  assert.equal(json.error.code, 'internal_error');
  assert.equal(JSON.stringify(json).includes('hunter2'), false);
});

test('a 429 says when to try again, in the Retry-After header and in the body', async () => {
  assert.deepEqual(await post('/slow-down', '{}'), {
    status: 429,
    json: { error: { code: 'too_many_requests', message: 'Too many tries. Wait a minute.', retryAfterSeconds: 61 } },
    retryAfter: '61',
  });
});
