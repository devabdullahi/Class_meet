import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { env } from '../env.js';
import { CSRF_HEADER, requireSameOriginRequest } from './csrf.js';
import { errorHandler } from './error-handler.js';

let server: Server;
let baseUrl: string;
const ALLOWED_ORIGIN = env.clientOrigins[0]!;

before(async () => {
  const app = express();
  app.use(requireSameOriginRequest);
  app.all('/thing', (_req, res) => {
    res.status(200).json({ ok: true });
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

async function call(method: string, headers: Record<string, string>): Promise<{ status: number; code?: string }> {
  const response = await fetch(`${baseUrl}/thing`, { method, headers });
  const json = (await response.json()) as { error?: { code: string } };
  return { status: response.status, ...(json.error === undefined ? {} : { code: json.error.code }) };
}

test('reads need no header', async () => {
  assert.deepEqual(await call('GET', {}), { status: 200 });
});

test('a write without the custom header is refused, as a cross-site form would send it', async () => {
  assert.deepEqual(await call('POST', {}), { status: 403, code: 'csrf_header_missing' });
  assert.deepEqual(await call('DELETE', {}), { status: 403, code: 'csrf_header_missing' });
});

test('a write from an origin the server does not know is refused even with the header', async () => {
  assert.deepEqual(await call('POST', { [CSRF_HEADER]: '1', origin: 'https://evil.example' }), {
    status: 403,
    code: 'origin_not_allowed',
  });
});

test('a write with the header from the app\'s own origin, or with no origin, goes through', async () => {
  assert.deepEqual(await call('POST', { [CSRF_HEADER]: '1', origin: ALLOWED_ORIGIN }), { status: 200 });
  assert.deepEqual(await call('POST', { [CSRF_HEADER]: '1' }), { status: 200 });
});
