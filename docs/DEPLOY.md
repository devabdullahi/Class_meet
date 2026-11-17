# Deploying Class Meet to Render

This puts Class Meet on the internet at an address like
`https://class-meet-cse3311.onrender.com`, so classmates can sign in with their
UTA accounts and try it without installing anything.

It takes about 30 minutes the first time. You need:

- the GitHub repository (`devabdullahi/Class_meet`), with the branch you want to
  deploy pushed to GitHub;
- the Neon project the team already uses;
- access to the **Class Meet** app registration in the Azure portal — the same
  one your local `server/.env` uses;
- a Render account (free; sign up with GitHub at <https://render.com/>).

## How the deployed app is put together

One Docker container runs one Node process. It serves the API under `/api` and
the built React app for every other path, on the same `https://` address, so
the session cookie stays first-party exactly as it is in development. Every
time the container starts it first runs the migrations, then starts the server:
Render's free plan has no separate "pre-deploy" step. The migration runner
skips anything already applied, so this is safe on every deploy. If a
migration fails, the new version never starts serving and Render keeps the
previous one live.

The build recipe is the [`Dockerfile`](../Dockerfile) at the repo root. Render
reads it for you; you never run Docker yourself.

---

## Step 1 — Create a new, empty database in Neon

> **Do not reuse the database you already have.** The existing Neon database
> holds an older schema from a different line of the project. Pointing this
> deployment at it would make the first migration fail (at best) and mix two
> incompatible schemas (at worst). Make a fresh, empty database for production
> and leave the old one untouched.
>
> Make a new **database**, not a new **branch**: a Neon branch starts as a copy
> of its parent, old tables included. A new database starts empty.

1. Go to <https://console.neon.tech/> and open the team's project.
2. In the left sidebar, open **Branches** and click the default branch
   (usually `main` or `production`).
3. Open the **Roles & Databases** tab (on some layouts this is a separate
   **Databases** page in the sidebar) and click **Add database**.
4. Database name: `classmeet_iter4` (underscores, not hyphens — a hyphen
   forces quoting in SQL). Owner: the existing role (usually `neondb_owner`).
   Click **Create**.
5. Click **Connect** (top right of the project dashboard). In the dialog:
   - **Branch**: the branch from step 2
   - **Database**: `classmeet_iter4` — check this; it defaults to the old one
   - **Connection pooling**: **on**

   Copy the connection string. Its hostname contains `-pooler`. This is
   `DATABASE_URL`.
6. Turn **Connection pooling** off and copy the string again (the same, minus
   `-pooler`). This is `DIRECT_DATABASE_URL`; migrations use it.
7. Paste both somewhere private for step 3. They contain the database password:
   never commit them or post them in chat.

Both strings must end in `/classmeet_iter4?...`. If either ends in
`/neondb?...` (or whatever the old database is called), go back to step 5.

## Step 2 — Generate a session secret

In any terminal (PowerShell, Terminal, Git Bash), run:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Copy the output. It is `SESSION_SECRET`: the key that signs everyone's sign-in
cookie. Use a new one for production rather than the one in your local
`server/.env`, and keep it private. Changing it later signs everyone out, and
nothing else.

## Step 3 — Create the web service on Render

1. Sign in at <https://dashboard.render.com/>.
2. Click **+ New** (top right) → **Web Service**.
3. **Source Code**: choose **Git Provider** → **GitHub**. If the repository is
   not listed, click **Configure GitHub** (or **Connect GitHub**), give Render
   access to `Class_meet`, and come back. Select `devabdullahi/Class_meet` and
   click **Connect**.
4. Fill in the form:

   | Field | Value |
   |---|---|
   | **Name** | `class-meet-cse3311` (anything; it becomes the web address) |
   | **Language** | **Docker** (Render usually picks it, because of the `Dockerfile`) |
   | **Branch** | the branch with the deployment commits — `main` once they are merged |
   | **Region** | the one closest to your Neon project's region (e.g. **Ohio** for Neon's `us-east-2`) |
   | **Root Directory** | leave empty |
   | **Dockerfile Path** | leave as `./Dockerfile` |
   | **Instance Type** | **Free** |

5. Under **Environment Variables**, add each row below with **+ Add
   Environment Variable** (or paste them all at once with **Add from .env**).

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | the **pooled** string from step 1.5 |
   | `DIRECT_DATABASE_URL` | the **direct** string from step 1.6 |
   | `SESSION_SECRET` | the value from step 2 |
   | `CLIENT_ORIGIN` | `https://<Name>.onrender.com` — your **Name** from step 3.4, no trailing slash. Step 4 checks it |
   | `ENTRA_CLIENT_ID` | the Application (client) ID — the same value as in your local `server/.env` |
   | `VITE_ENTRA_CLIENT_ID` | the **same** client ID again |
   | `UTA_TENANT_ID` | `5cdc5b43-d7be-4caa-8173-729e3b0a62d9` (UTA), or the value from your local `server/.env` if it differs |
   | `VITE_ENTRA_TENANT_ID` | the same tenant ID as `UTA_TENANT_ID` |
   | `ENTRA_API_SCOPE` | `access_as_user` (or your local value, if different) |

   Do **not** add `ALLOW_DEV_LOGIN` (the server refuses to start in production
   with it on), and do not add `PORT` (Render sets it).

6. Click **Advanced** and set **Health Check Path** to `/api/health`. Leave the
   rest as it is.
7. Click **Deploy Web Service**.

The first build takes 3–6 minutes. The log should end with lines like:

```
[migrate] applying 001_create_users.sql
...
[migrate] applied 4 migration(s)
[api] serving the client from /app/client/dist
[api] Class Meet API listening on http://localhost:10000 (production)
==> Your service is live
```

(The `localhost` in that line is the address inside the container; Render
forwards your public `https://` address to it.)

## Step 4 — Check the address, and fix `CLIENT_ORIGIN` if Render changed it

At the top of the service page, under its name, Render shows the real address,
e.g. `https://class-meet-cse3311.onrender.com`. If the name was taken, Render
adds a suffix (`https://class-meet-cse3311-x7k2.onrender.com`).

If it differs from what you entered for `CLIENT_ORIGIN`: open **Environment**
in the left sidebar, edit `CLIENT_ORIGIN` to the exact address (with
`https://`, without a trailing `/`), and click **Save, rebuild, and deploy**.
Until it matches, signing in fails with `403 origin_not_allowed`.

## Step 5 — Let Microsoft send students back to the new address

Microsoft only returns a signed-in user to addresses listed on the app
registration, so add the deployed one:

1. Go to <https://portal.azure.com/> → **Microsoft Entra ID** → **App
   registrations** → **All applications** → **Class Meet**.
2. Open **Authentication** in the left menu.
3. Under the existing **Single-page application** platform (the one that
   already lists `http://localhost:5173/redirect.html`), click **Add URI** and
   enter, exactly:

   ```
   https://<your-address>.onrender.com/redirect.html
   ```

   It must be under **Single-page application**, not **Web**.
4. Click **Save** at the bottom.

That is the only portal change. The client ID, scope and token settings are
the ones the app already uses locally.

## Step 6 — Check that it works

1. Open `https://<your-address>.onrender.com/api/health`. Expect:

   ```json
   {"ok":true,"env":"production","databaseConfigured":true}
   ```

2. Open `https://<your-address>.onrender.com/`. The Class Meet sign-in page
   appears.
3. Click **Sign in with your UTA account**, finish the Microsoft popup, and
   check you land on **My courses**.
4. Add a course, create a group, and have a classmate (signed in on their own
   device) find the group and ask to join.

## Step 7 — Optional: add more courses to the catalog

Students can only add courses that exist in the catalog. The migrations seed
three: CSE 3311, CSE 4308 and CSE 4316. To give classmates more to choose from,
add a few real UTA CSE courses:

1. In the Neon console, open **SQL Editor** (left sidebar).
2. At the top of the editor, set the branch to the one from step 1 and the
   **database to `classmeet_iter4`**. Running this against the old database
   would add rows to it.
3. Paste and click **Run**:

   ```sql
   -- UTA CSE courses, from the 2025–2026 BS in Computer Science degree plan.
   -- ON CONFLICT makes it safe to run more than once.
   INSERT INTO courses (code, title) VALUES
       ('CSE 1310', 'Introduction to Programming'),
       ('CSE 1320', 'Intermediate Programming'),
       ('CSE 1325', 'Object-Oriented Programming'),
       ('CSE 2312', 'Computer Organization'),
       ('CSE 2315', 'Discrete Structures'),
       ('CSE 3302', 'Programming Languages'),
       ('CSE 3310', 'Introduction to Software Engineering'),
       ('CSE 3315', 'Theoretical Computer Science'),
       ('CSE 3318', 'Algorithms and Data Structures'),
       ('CSE 3320', 'Operating Systems'),
       ('CSE 3330', 'Databases'),
       ('CSE 3380', 'Linear Algebra for CSE'),
       ('CSE 4303', 'Computer Graphics'),
       ('CSE 4305', 'Compilers'),
       ('CSE 4309', 'Fundamentals of Machine Learning'),
       ('CSE 4344', 'Computer Networks'),
       ('CSE 4360', 'Autonomous Robot Design and Programming'),
       ('CSE 4380', 'Information Security')
   ON CONFLICT (code) DO NOTHING;
   ```

The app reads the catalog live, so the new courses show up in **Add course**
straight away; no redeploy is needed.

---

## Before you present: wake it up

On Render's free plan the service **goes to sleep after 15 minutes without
visitors**, and the next visit waits about **a minute** while it starts again
(Render shows a loading page meanwhile). The Neon database also pauses when
idle and takes a second or two to resume.

So **open the site a minute or two before you present or send the link**, and
wait for the sign-in page to appear. After that it is fast until it has been
idle for 15 minutes again.

Free services also restart from a fresh container on every deploy and may be
restarted by Render at any time. That is fine: everything Class Meet keeps is
in Neon, not on the container's disk.

## Updating the deployment

Push to the deployed branch. Render rebuilds and redeploys automatically
(**Auto-Deploy: On Commit** is the default), and any new migration runs as the
new version starts. To redeploy without a push, use **Manual Deploy → Deploy
latest commit** on the service page.

Changing `VITE_ENTRA_CLIENT_ID` or `VITE_ENTRA_TENANT_ID` needs a rebuild,
because they are compiled into the browser code. Render rebuilds on every
deploy, so **Save, rebuild, and deploy** covers it.

## Environment variables reference

| Variable | Required | Read when | What it is |
|---|---|---|---|
| `NODE_ENV` | yes | runtime | `production`. Turns on `Secure` cookies and serving the built app. The image sets it too |
| `DATABASE_URL` | yes | runtime | Neon **pooled** connection string for the new database |
| `DIRECT_DATABASE_URL` | recommended | runtime (migrations) | Neon **direct** string for the same database. Migrations fall back to `DATABASE_URL` without it |
| `SESSION_SECRET` | yes | runtime | At least 32 random characters; signs the session cookie. Secret |
| `CLIENT_ORIGIN` | yes | runtime | The site's exact address, `https://<name>.onrender.com`. Write requests from any other origin are refused |
| `ENTRA_CLIENT_ID` | yes | runtime | Application (client) ID of the app registration |
| `ENTRA_API_SCOPE` | no (default `access_as_user`) | runtime | Scope name under **Expose an API** |
| `UTA_TENANT_ID` | no (default UTA) | runtime | The only tenant whose users may sign in |
| `SESSION_TTL_DAYS` | no (default `7`) | runtime | How long a sign-in lasts |
| `PORT` | no — **leave unset** | runtime | Render provides it (`10000`) |
| `ALLOW_DEV_LOGIN` | **must be unset** | runtime | Development-only bypass. With `NODE_ENV=production` the server refuses to start |
| `VITE_ENTRA_CLIENT_ID` | yes | **build** | Same client ID, compiled into the browser code. Not a secret |
| `VITE_ENTRA_TENANT_ID` | no (default UTA) | **build** | Tenant whose sign-in page students see. Not a secret |

Render passes every environment variable to the Docker build as a build
argument, which is how the two `VITE_` values reach the client build. Only
those two are used at build time; the rest are read when the server starts and
are never stored in the image.

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Build fails at `npm ci` | `package-lock.json` is out of step with a `package.json`. Run `npm install` locally, commit the updated lock file, push |
| Build fails at `npm run build` with TypeScript errors | The branch does not compile. Run `npm run build` locally and fix it before pushing |
| Deploy fails: `Missing required environment variable SESSION_SECRET` or `must be at least 32 characters` | Add or regenerate `SESSION_SECRET` (step 2) |
| Deploy fails: `ALLOW_DEV_LOGIN=true with NODE_ENV=production` | Delete `ALLOW_DEV_LOGIN` from **Environment** |
| Deploy fails: `[migrate] No database connection string` | `DATABASE_URL` is missing or misspelled |
| Deploy fails: `[migrate] Could not connect to the database` | Wrong connection string, a copy-paste that lost a character, or a typo in the database name. Copy it again from Neon's **Connect** dialog |
| Deploy fails: `Migration 002_... failed ... relation "courses" already exists` | `DATABASE_URL` points at the **old** database. Stop, and repeat step 1 so it ends in `/classmeet_iter4`. The failed migration was rolled back, so nothing was changed |
| `502 Bad Gateway`, or Render's loading page for more than ~2 minutes | The service is waking up (wait a minute), or it crashed on start: open **Logs** on the service page and look at the last lines |
| `/api/health` says `"databaseConfigured":false` | `DATABASE_URL` is not set on the service |
| Pages load but actions fail with `503 database_unavailable` | Neon was waking up (retry), or the connection string is wrong |
| Signing in fails with `403 origin_not_allowed` | `CLIENT_ORIGIN` is not exactly the address in the browser's address bar (step 4) |
| The Microsoft popup shows `AADSTS50011` / redirect URI mismatch | The `/redirect.html` URI is missing or mistyped in the portal (step 5) |
| A CORS error as the popup closes | The redirect URI was added under **Web** instead of **Single-page application** |
| The login page says the client IDs disagree | `ENTRA_CLIENT_ID` and `VITE_ENTRA_CLIENT_ID` differ. Fix one, then **Save, rebuild, and deploy** |
| `403 tenant_not_allowed` | A personal or non-UTA Microsoft account, or `UTA_TENANT_ID` differs from your working local value |
| Microsoft says "Need admin approval" | The tenant does not let students consent to apps on their own. Ask whoever registered the app, or the course staff; it is a tenant setting, not a code problem |
| The browser console shows `Refused to ... because it violates the following Content Security Policy directive` | Something new is loading from a domain the policy does not allow. The policy is in `server/src/middleware/security-headers.ts`; add the domain to the matching directive there, with a reason |
| The site works, then is slow once | It went to sleep after 15 idle minutes. Expected on the free plan |

## Rehearsing locally (optional)

To check the production build before pushing, without Docker:

```bash
npm run build
```

Then start it with production settings in the environment — in PowerShell,
from the repo root:

```powershell
$env:NODE_ENV = 'production'; $env:PORT = '4100'; $env:CLIENT_ORIGIN = 'http://localhost:4100'; $env:ALLOW_DEV_LOGIN = 'false'
node server/dist/scripts/migrate.js; node server/dist/index.js
```

Other values (database, Entra, secret) come from `server/.env`, and the app is
at <http://localhost:4100>. Sign-in there additionally needs
`http://localhost:4100/redirect.html` registered in the portal. Set
`ALLOW_DEV_LOGIN` to `false` explicitly rather than leaving it empty, so that a
`true` in `server/.env` does not stop the server from starting.

With Docker installed, the same image Render builds can be run with:

```bash
docker build --build-arg VITE_ENTRA_CLIENT_ID=<client-id> -t class-meet .
docker run --rm -p 4100:4000 -e CLIENT_ORIGIN=http://localhost:4100 \
  -e SESSION_SECRET=<secret> -e DATABASE_URL=<connection-string> \
  -e ENTRA_CLIENT_ID=<client-id> class-meet
```
