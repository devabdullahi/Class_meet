/**
 * The app as deployed: the API and the built client on one origin.
 *
 * Runs the real `createApp` over HTTP with a fake `client/dist`, so a change
 * to the mounting order — the SPA fallback above the /api 404, or a router
 * above the security headers — fails here rather than in production.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

// env.ts validates at import time, so the environment is set first and the
// app is imported after it. A value already set in server/.env is not used:
// dotenv never overrides a variable that is already present.
process.env['SESSION_SECRET'] = 'test-session-secret-that-is-long-enough-0123456789';
process.env['NODE_ENV'] = 'test';
const { createApp } = await import('./app.js');
const { CONTENT_SECURITY_POLICY } = await import('./middleware/security-headers.js');

const INDEX_HTML = '<!doctype html><title>Class Meet</title><div id="root"></div>';
const REDIRECT_HTML = '<!doctype html><title>Signing in</title>';
const ASSET_JS = 'console.log("main");';

/** What a browser sends when the user navigates to a page. */
const NAVIGATION = { Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' };

let distDir: string;
let server: Server;
let baseUrl: string;

before(async () => {
  distDir = await mkdtemp(path.join(tmpdir(), 'class-meet-dist-'));
  await mkdir(path.join(distDir, 'assets'));
  await writeFile(path.join(distDir, 'index.html'), INDEX_HTML);
  await writeFile(path.join(distDir, 'redirect.html'), REDIRECT_HTML);
  await writeFile(path.join(distDir, 'assets', 'main-AbC123.js'), ASSET_JS);

  server = createApp({ clientDistDir: distDir }).listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
});

after(async () => {
  server.close();
  await once(server, 'close');
  await rm(distDir, { recursive: true, force: true });
});

describe('serving the built client', () => {
  test('serves index.html at the root, marked for revalidation', async () => {
    const response = await fetch(`${baseUrl}/`, { headers: NAVIGATION });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), INDEX_HTML);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    assert.match(response.headers.get('content-type') ?? '', /text\/html/);
  });

  test('falls back to index.html for a client-side route', async () => {
    const response = await fetch(`${baseUrl}/groups/9a8b7c6d-1111-4222-8333-444455556666`, {
      headers: NAVIGATION,
    });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), INDEX_HTML);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
  });

  test('serves redirect.html as itself, not as the app', async () => {
    // The MSAL popup lands here; loading the app instead would swallow the response.
    const response = await fetch(`${baseUrl}/redirect.html?state=abc`, { headers: NAVIGATION });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), REDIRECT_HTML);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
  });

  test('serves hashed assets with a long-lived immutable cache', async () => {
    const response = await fetch(`${baseUrl}/assets/main-AbC123.js`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), ASSET_JS);
    assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.match(response.headers.get('content-type') ?? '', /javascript/);
  });

  test('answers a missing asset with 404 rather than the app HTML', async () => {
    // An old tab asking for an asset a new deploy removed must not get HTML,
    // which would surface as a baffling MIME-type error.
    const response = await fetch(`${baseUrl}/assets/main-OldHash.js`, { headers: NAVIGATION });
    assert.equal(response.status, 404);
    assert.notEqual(await response.text(), INDEX_HTML);
  });

  test('does not answer a non-navigation request with the app HTML', async () => {
    const jsonOnly = await fetch(`${baseUrl}/groups/some-id`, { headers: { Accept: 'application/json' } });
    assert.equal(jsonOnly.status, 404);

    const post = await fetch(`${baseUrl}/groups/some-id`, { method: 'POST', headers: { ...NAVIGATION, 'X-Class-Meet': '1' } });
    assert.equal(post.status, 404);
  });
});

describe('the API next to the built client', () => {
  test('answers the health check', async () => {
    const response = await fetch(`${baseUrl}/api/health`, { headers: NAVIGATION });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { ok: boolean };
    assert.equal(body.ok, true);
  });

  test('answers an unknown API path with a JSON 404, even for a browser navigation', async () => {
    const response = await fetch(`${baseUrl}/api/no-such-route`, { headers: NAVIGATION });
    assert.equal(response.status, 404);
    assert.match(response.headers.get('content-type') ?? '', /application\/json/);
    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'not_found');
  });
});

describe('security headers', () => {
  for (const [label, pathname] of [
    ['the app page', '/'],
    ['the redirect bridge', '/redirect.html'],
    ['an API response', '/api/health'],
    ['an API error', '/api/no-such-route'],
  ] as const) {
    test(`are set on ${label}`, async () => {
      const response = await fetch(`${baseUrl}${pathname}`, { headers: NAVIGATION });
      assert.equal(response.headers.get('content-security-policy'), CONTENT_SECURITY_POLICY);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
      assert.equal(response.headers.get('referrer-policy'), 'same-origin');
      assert.equal(response.headers.get('x-powered-by'), null);
    });
  }
});

/** One directive's sources, e.g. `connect-src` -> ["'self'", "https://..."]. */
function directive(name: string): string[] {
  const entry = CONTENT_SECURITY_POLICY.split('; ').find((part) => part.startsWith(`${name} `));
  assert.ok(entry, `CSP has no ${name} directive`);
  return entry.split(' ').slice(1);
}

describe('the content security policy', () => {
  test('allows only our own scripts, styles and fonts', () => {
    assert.deepEqual(directive('script-src'), ["'self'"]);
    assert.deepEqual(directive('style-src'), ["'self'"]);
    assert.deepEqual(directive('font-src'), ["'self'"]);
    assert.deepEqual(directive('object-src'), ["'none'"]);
  });

  test('allows the data: image the stylesheet uses for the select arrow', () => {
    assert.ok(directive('img-src').includes('data:'));
  });

  test('lets MSAL reach Microsoft sign-in for tokens and silent renewal', () => {
    // Removing either breaks sign-in in a way no unit test of our own code sees.
    assert.ok(directive('connect-src').includes('https://login.microsoftonline.com'));
    assert.ok(directive('frame-src').includes('https://login.microsoftonline.com'));
    assert.ok(directive('frame-src').includes("'self'"), 'silent renewal lands on our redirect page');
  });

  test('refuses framing by any other site', () => {
    assert.deepEqual(directive('frame-ancestors'), ["'self'"]);
  });
});
