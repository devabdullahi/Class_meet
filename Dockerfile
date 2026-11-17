# Class Meet production image: one Node process serving the API under /api
# and the built SPA (client/dist) for everything else, on one origin.
# Render builds it from this file; see docs/DEPLOY.md.
#
#   docker build -t class-meet .
#   docker run -p 4000:4000 --env-file <your production env file> class-meet
#
# VITE_* values (needed only if Microsoft sign-in is turned on) are compiled
# into the client bundle by Vite, so they are build arguments, not runtime
# environment. Neither is a secret: the SPA is a public client. Everything
# the server reads (SESSION_SECRET, DATABASE_URL, SMTP_PASS, CLIENT_ORIGIN,
# ...) is passed when the container starts
# and is never baked into the image. Render passes a service's environment
# variables to `docker build` as build arguments, so the two VITE_* values
# can be set alongside the others in its dashboard.

# --- build: install everything, compile the server, bundle the client ------
# Debian rather than Alpine here: Vite's bundler and CSS minifier ship native
# binaries, and the glibc builds are the most widely exercised ones.
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Manifests first, so the dependency layer is reused until they change.
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci

COPY client client
COPY server server

ARG VITE_ENTRA_CLIENT_ID=""
ARG VITE_ENTRA_TENANT_ID=""
ENV VITE_ENTRA_CLIENT_ID=${VITE_ENTRA_CLIENT_ID} \
    VITE_ENTRA_TENANT_ID=${VITE_ENTRA_TENANT_ID}

RUN npm run build

# --- runtime: server dependencies, compiled server, built client -----------
# The server's dependencies are plain JavaScript, so the smaller Alpine image
# is enough at runtime.
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=4000
WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
# Only the server workspace's production dependencies: the client's React and
# MSAL packages are already bundled into client/dist. --ignore-scripts because
# nothing the server needs has an install step.
RUN npm ci --omit=dev --workspace server --ignore-scripts \
 && npm cache clean --force

COPY --from=build /app/server/dist server/dist
# Read at startup by server/dist/scripts/migrate.js.
COPY server/migrations server/migrations
COPY --from=build /app/client/dist client/dist

# The official image's unprivileged user; nothing here needs root.
USER node
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

# Apply pending migrations, then start. Render's free plan has no pre-deploy
# step, so this is where the schema is brought up to date on every deploy.
# The runner skips migrations that have already been applied and runs each
# new one in a transaction, so repeating it is safe; if one fails the
# container exits before serving, and Render keeps the previous deploy live.
# `exec` makes Node PID 1 so it receives Render's SIGTERM and shuts down
# cleanly (see server/src/index.ts).
CMD ["sh", "-c", "node server/dist/scripts/migrate.js && exec node server/dist/index.js"]
