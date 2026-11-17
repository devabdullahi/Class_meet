/**
 * The startup checks in env.ts run when the module loads, so each case loads
 * it in a fresh Node process with its own environment.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Loads env.ts with these variables (on top of server/.env, which never overrides them). */
function loadEnv(variables: Record<string, string>): { ok: boolean; stderr: string } {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', "await import('./src/env.ts');"],
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
        ...variables,
      },
      encoding: 'utf8',
    },
  );
  return { ok: result.status === 0, stderr: result.stderr };
}

test('production refuses to start without SMTP, so codes can never fall back to the console', () => {
  const { ok, stderr } = loadEnv({ NODE_ENV: 'production' });
  assert.equal(ok, false);
  assert.match(stderr, /NODE_ENV=production without SMTP_HOST/);
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
