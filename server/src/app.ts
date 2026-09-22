import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth.js';
import { requireSameOriginRequest } from './middleware/csrf.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { isDatabaseConfigured } from './db/pool.js';
import { env } from './env.js';

export function createApp(): Express {
  const app = express();

  // We sit behind Vite's dev proxy locally and would sit behind a platform
  // proxy in production; trusting it lets `secure` cookies and req.protocol work.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(express.json({ limit: '16kb' }));
  app.use(cookieParser());

  // No CORS middleware on purpose. In development the Vite dev server proxies
  // /api to this process, so the browser only ever sees one origin and the
  // session cookie is first-party. In production the SPA and API are served
  // from the same origin too. Cross-origin cookies (SameSite=None) would be a
  // step backwards for both security and simplicity.
  app.use(requireSameOriginRequest);

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      env: env.nodeEnv,
      databaseConfigured: isDatabaseConfigured(),
    });
  });

  app.use('/api/auth', authRouter);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}
