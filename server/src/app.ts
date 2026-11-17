import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth.js';
import { createCoursesRouter } from './routes/courses.js';
import { createCourseLinksRouter } from './routes/course-links.js';
import { createGroupsRouter } from './routes/groups.js';
import { createMeRouter } from './routes/me.js';
import { createProfileRouter } from './routes/profile.js';
import { postgresGroupRepository } from './groups/repository.js';
import { postgresProfileRepository } from './profiles/repository.js';
import { createModerationRouter } from './routes/moderation.js';
import { createReportsRouter } from './routes/reports.js';
import { postgresModerationRepository } from './moderation/repository.js';
import { requireAuth } from './middleware/require-auth.js';
import { requireSameOriginRequest } from './middleware/csrf.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { setSecurityHeaders } from './middleware/security-headers.js';
import { createClientRouter, locateClientDist } from './static-client.js';
import { isDatabaseConfigured } from './db/pool.js';
import { env } from './env.js';

export interface AppOptions {
  /**
   * The built client (`client/dist`) to serve next to /api, or null to serve
   * the API alone. Left out, it is the repo's own build in production and
   * null in development, where Vite serves the client. Tests pass a fake
   * build so they can exercise the production wiring without NODE_ENV.
   */
  clientDistDir?: string | null;
}

/**
 * The build to serve by default. A production server without one still runs
 * the API, so the deploy is diagnosable; it says so loudly instead.
 */
function defaultClientDistDir(): string | null {
  if (!env.isProduction) return null;

  const distDir = locateClientDist();
  if (distDir === null) {
    console.warn(
      '[api] client/dist/index.html not found, so only /api is served. Run `npm run build` ' +
        'from the repo root before starting in production.',
    );
  } else {
    console.log(`[api] serving the client from ${distDir}`);
  }
  return distDir;
}

export function createApp(options: AppOptions = {}): Express {
  const clientDistDir =
    options.clientDistDir === undefined ? defaultClientDistDir() : options.clientDistDir;

  const app = express();

  // We sit behind Vite's dev proxy locally and behind exactly one platform
  // proxy in production (Render's); trusting one hop lets `secure` cookies
  // and req.protocol work without letting a client forge X-Forwarded-For.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(setSecurityHeaders);

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
  app.use('/api/me/profile', requireAuth, createProfileRouter(postgresProfileRepository));
  app.use('/api/course-links', createCourseLinksRouter(postgresGroupRepository));
  app.use('/api/me', requireAuth, createMeRouter(postgresGroupRepository));
  app.use('/api/courses', requireAuth, createCoursesRouter(postgresGroupRepository));
  // Reports about a group live under the group's address. This router answers
  // only its own paths and passes every other one on to the groups router.
  app.use('/api/groups', requireAuth, createReportsRouter(postgresModerationRepository));
  app.use('/api/groups', requireAuth, createGroupsRouter(postgresGroupRepository));
  app.use('/api/moderation', requireAuth, createModerationRouter(postgresModerationRepository));

  // Before the client router, so an unknown API path is a JSON 404 and never
  // the SPA's HTML.
  app.use('/api', notFoundHandler);

  if (clientDistDir !== null) app.use(createClientRouter(clientDistDir));

  app.use(errorHandler);

  return app;
}
