import { createApp } from './app.js';
import { env } from './env.js';
import { closePool, isDatabaseConfigured } from './db/pool.js';
import { isEntraConfigured } from './entra.js';

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`[api] Class Meet API listening on http://localhost:${env.port} (${env.nodeEnv})`);
  console.log(`[api] admitting Entra tenant ${env.utaTenantId} (${env.tenantDisplayName}) only`);
  console.log(`[api] accepting requests from: ${env.clientOrigins.join(', ')}`);

  // DEVELOPMENT SIGN-IN BYPASS — REMOVE BEFORE THE PILOT.
  if (env.allowDevLogin) {
    console.warn(
      '[api] ALLOW_DEV_LOGIN is on: POST /api/auth/dev-login will hand out a session for a fake ' +
        'student with no credentials. Development only — remove it before deploying.',
    );
  }

  if (!isEntraConfigured()) {
    console.warn(
      '[api] ENTRA_CLIENT_ID is not set. The server will run, but sign-in will return 503 ' +
        'until you register the app in the Azure portal and add its Application (client) ID ' +
        'to server/.env.',
    );
  }

  if (!isDatabaseConfigured()) {
    console.warn(
      '[api] DATABASE_URL is not set. The server will run, but sign-in will return 503 ' +
        'until you add your Neon connection string to server/.env and run `npm run migrate`.',
    );
  }
});

async function shutdown(signal: string): Promise<void> {
  console.log(`[api] ${signal} received, shutting down`);
  server.close();
  try {
    await closePool();
  } catch (error) {
    console.error('[api] error closing database pool:', error);
  }
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
