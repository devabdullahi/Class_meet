/**
 * Serving the built SPA (`client/dist`) from the API process in production,
 * so the browser sees one origin and the session cookie stays first-party
 * (see the CORS note in `app.ts`). In development Vite serves the SPA and
 * proxies /api here instead, so none of this runs.
 *
 * Mounted after the /api 404 handler, so no API path can ever be answered
 * with the SPA's HTML.
 */
import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Vite puts every content-hashed file here; a hash change is a new URL. */
const HASHED_ASSETS_PREFIX = `${path.sep}assets${path.sep}`;

/** A hashed file never changes under the same name, so browsers may keep it for a year. */
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

/**
 * HTML and any other unhashed file must be revalidated on every load, or a
 * browser could keep an old index.html that points at assets a new deploy
 * no longer has.
 */
const REVALIDATE_CACHE = 'no-cache';

/** How far up from this file to look; source and compiled output are both two levels below the repo root. */
const MAX_SEARCH_DEPTH = 5;

/**
 * Walks up from `startDir` until it finds `client/dist/index.html`, so the
 * same code works from `server/src` (tsx) and `server/dist` (compiled), and in
 * the Docker image, which keeps the repo layout. Returns null when the client
 * has not been built.
 */
export function locateClientDist(startDir: string = path.dirname(fileURLToPath(import.meta.url))): string | null {
  let dir = startDir;
  for (let depth = 0; depth < MAX_SEARCH_DEPTH; depth += 1) {
    const candidate = path.join(dir, 'client', 'dist');
    if (existsSync(path.join(candidate, 'index.html'))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function setCacheHeaders(res: Response, filePath: string): void {
  res.setHeader('Cache-Control', filePath.includes(HASHED_ASSETS_PREFIX) ? IMMUTABLE_CACHE : REVALIDATE_CACHE);
}

/**
 * A request for a page of the app rather than for a file: a browser
 * navigation to a client-side route such as `/groups/<id>`. A missing file
 * (`/assets/old-hash.js`) has an extension and gets a real 404 instead of
 * HTML, which would otherwise surface as a baffling MIME-type error.
 */
function isAppNavigation(req: Request): boolean {
  return (
    (req.method === 'GET' || req.method === 'HEAD') &&
    path.extname(req.path) === '' &&
    req.accepts('html') !== false
  );
}

/**
 * Real files first (`index.html`, `redirect.html`, `/assets/*`), then every
 * app navigation falls back to `index.html` so React Router can take it.
 * `redirect.html` is therefore always served as itself: it is the MSAL
 * popup's landing page and must not load the app.
 */
export function createClientRouter(distDir: string): Router {
  const router = Router();
  const indexHtml = path.join(distDir, 'index.html');

  router.use(
    express.static(distDir, {
      index: false,
      // A bare `/` is an app navigation like any other; see the fallback below.
      redirect: false,
      setHeaders: setCacheHeaders,
    }),
  );

  router.use((req: Request, res: Response, next: NextFunction) => {
    if (!isAppNavigation(req)) {
      next();
      return;
    }
    setCacheHeaders(res, indexHtml);
    res.sendFile(indexHtml, (error?: Error) => {
      if (error !== undefined) next(error);
    });
  });

  return router;
}
