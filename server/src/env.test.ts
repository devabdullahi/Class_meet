/**
 * The startup checks in env.ts run when the module loads, so each case loads
 * it in a fresh Node process with its own environment.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Runs `script` (an ES module body, run from server/) with these variables, on
 * top of server/.env, which never overrides them. By default it only loads
 * env.ts, which is where the startup checks are.
 */
function loadEnv(
  variables: Record<string, string>,
  script = "await import('./src/env.ts');",
): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', script],
    {
      cwd: serverRoot,
      env: {
        ...process.env,
        SESSION_SECRET: 'test-session-secret-that-is-long-enough-0123456789',
        ALLOW_DEV_LOGIN: '',
        SMTP_HOST: '',
        SMTP_PORT: '',
        SMTP_SECURE: '',
        SMTP_USER: '',
        SMTP_PASS: '',
        EMAIL_FROM: '',
        EMAIL_PROVIDER: '',
        BREVO_API_KEY: '',
        ENABLE_MICROSOFT_LOGIN: '',
        CLIENT_ORIGIN: '',
        DATABASE_URL: '',
        DIRECT_DATABASE_URL: '',
        ...variables,
      },
      encoding: 'utf8',
    },
  );
  return { ok: result.status === 0, stdout: result.stdout, stderr: result.stderr };
}

test('production refuses to start without an email provider, so codes can never fall back to the console', () => {
  const { ok, stderr } = loadEnv({ NODE_ENV: 'production' });
  assert.equal(ok, false);
  assert.match(stderr, /NODE_ENV=production without an email provider/);
  assert.match(stderr, /EMAIL_PROVIDER=brevo with BREVO_API_KEY and EMAIL_FROM/);
});

test('production starts with Brevo configured', () => {
  const { ok, stderr } = loadEnv({
    NODE_ENV: 'production',
    EMAIL_PROVIDER: 'brevo',
    BREVO_API_KEY: 'xkeysib-test-key',
    EMAIL_FROM: 'Class Meet <classmeet.uta@gmail.com>',
  });
  assert.equal(ok, true, stderr);
});

test('production refuses an incomplete Brevo configuration, naming what is missing', () => {
  const { ok, stderr } = loadEnv({ NODE_ENV: 'production', EMAIL_PROVIDER: 'brevo', EMAIL_FROM: 'a@b.org' });
  assert.equal(ok, false);
  assert.match(stderr, /EMAIL_PROVIDER=brevo needs BREVO_API_KEY/);
});

test('settings for two providers stop startup', () => {
  const { ok, stderr } = loadEnv({
    NODE_ENV: 'production',
    BREVO_API_KEY: 'xkeysib-test-key',
    SMTP_HOST: 'smtp.gmail.com',
    EMAIL_FROM: 'a@b.org',
  });
  assert.equal(ok, false);
  assert.match(stderr, /SMTP_HOST is set, but email goes through Brevo/);
});

test('production starts with SMTP configured', () => {
  const { ok, stderr } = loadEnv({
    NODE_ENV: 'production',
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_USER: 'classmeet.uta@gmail.com',
    SMTP_PASS: 'app-password',
    EMAIL_FROM: 'Class Meet <classmeet.uta@gmail.com>',
  });
  assert.equal(ok, true, stderr);
});

test('development starts without SMTP', () => {
  const { ok, stderr } = loadEnv({ NODE_ENV: 'development' });
  assert.equal(ok, true, stderr);
});

test('a malformed EMAIL_LOGIN_DOMAINS stops startup', () => {
  const { ok, stderr } = loadEnv({ NODE_ENV: 'development', EMAIL_LOGIN_DOMAINS: 'uta' });
  assert.equal(ok, false);
  assert.match(stderr, /EMAIL_LOGIN_DOMAINS contains "uta"/);
});

/** A complete Brevo configuration with a fake key: enough for production to start. */
const BREVO = {
  EMAIL_PROVIDER: 'brevo',
  BREVO_API_KEY: 'xkeysib-test-key',
  EMAIL_FROM: 'Class Meet <classmeet.uta@gmail.com>',
};

describe('the development sign-in bypass in production', () => {
  for (const flag of ['true', 'TRUE', ' true ']) {
    test(`ALLOW_DEV_LOGIN=${JSON.stringify(flag)} stops a production server from starting`, () => {
      const { ok, stderr } = loadEnv({ NODE_ENV: 'production', ...BREVO, ALLOW_DEV_LOGIN: flag });
      assert.equal(ok, false);
      assert.match(stderr, /ALLOW_DEV_LOGIN=true with NODE_ENV=production/);
    });
  }

  // The whole app, as `node server/dist/index.js` builds it, but on a random
  // port and without the client build.
  test('without the flag, production neither offers the bypass nor honours it', () => {
    const script = `
      const { createApp } = await import('./src/app.ts');
      const server = createApp({ clientDistDir: null }).listen(0, '127.0.0.1');
      await new Promise((resolve) => server.once('listening', resolve));
      const base = 'http://127.0.0.1:' + server.address().port;
      const config = await (await fetch(base + '/api/auth/config')).json();
      const devLogin = await fetch(base + '/api/auth/dev-login', { method: 'POST', headers: { 'X-Class-Meet': '1' } });
      console.log(JSON.stringify({
        devLoginEnabled: config.devLoginEnabled,
        microsoftLoginEnabled: config.microsoftLoginEnabled,
        devLoginStatus: devLogin.status,
        devLoginCookie: devLogin.headers.get('set-cookie'),
      }));
      // Exit rather than wait for fetch's keep-alive connections to time out.
      process.exit(0);
    `;
    const { ok, stdout, stderr } = loadEnv({ NODE_ENV: 'production', ...BREVO }, script);
    assert.equal(ok, true, stderr);
    assert.deepEqual(JSON.parse(stdout.trim().split('\n').at(-1) ?? ''), {
      devLoginEnabled: false,
      microsoftLoginEnabled: false,
      devLoginStatus: 403,
      devLoginCookie: null,
    });
  });
});
