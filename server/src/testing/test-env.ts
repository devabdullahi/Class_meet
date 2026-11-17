/**
 * Loaded before every server test file (`npm test` passes it to `--import`),
 * so tests never depend on a developer's git-ignored server/.env.
 *
 * env.ts validates at import time and dotenv never overrides a variable that
 * is already set, so setting these here wins over whatever server/.env says:
 * a fresh clone and a configured laptop run the tests with the same values.
 * Anything that would make a test reach a real database, a real mail server
 * or Microsoft is switched off; tests that need one of them build it
 * themselves (PGlite, a recording sender).
 */
const TEST_ENVIRONMENT: Record<string, string> = {
  NODE_ENV: 'test',
  SESSION_SECRET: 'test-session-secret-that-is-long-enough-0123456789',
  DATABASE_URL: '',
  DIRECT_DATABASE_URL: '',
  ALLOW_DEV_LOGIN: '',
  ENABLE_MICROSOFT_LOGIN: '',
  EMAIL_PROVIDER: '',
  EMAIL_FROM: '',
  BREVO_API_KEY: '',
  SMTP_HOST: '',
  SMTP_PORT: '',
  SMTP_SECURE: '',
  SMTP_USER: '',
  SMTP_PASS: '',
};

Object.assign(process.env, TEST_ENVIRONMENT);
