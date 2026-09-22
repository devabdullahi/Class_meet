# Class Meet

A course-scoped study group finder for university students.

Students sign up with their university email, add the courses they are taking,
and browse the open study groups for those exact courses — with meeting day,
time, location, and remaining seats shown. If nothing fits, they create a group
in the same place, and other students in that course can find it.

The problem we are solving is **discovery, not communication**. Students already
have good tools for talking to people they know (GroupMe, Discord). None of them
has a directory, so joining requires an invite from someone you already know —
which the newest, commuting, and part-time students do not have.

---

## Course

CSE 3311 — Software Engineering II
The University of Texas at Arlington

## Team

| Name | GitHub |
|---|---|
| Abdullahi Abdullah Khalafalla | @devabdullahi |
| Phyo Ei Ko | |
| Jesus Martinez | |
| Shofi Shrestha | |

## Deliverables

| Phase | Document | Tag |
|---|---|---|
| Inception | `docs/ClassMeet_Inception.pdf` | `v0.1.0-inception` |
| Inception | `docs/ClassMeet_Inception_Slides.pptx` | `v0.1.0-inception` |

**The version to review for the inception submission is `v0.1.0-inception`.**

Per the assignment, no application code existed at the inception phase.
Application code begins with iteration 1 — see **Running the app** below.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React 19 + TypeScript, built by Vite 8 | `client/` workspace |
| Routing | React Router | Two routes so far: `/login` and `/` |
| Styling | Hand-written CSS with custom properties | No UI framework; two screens do not justify one |
| Backend | Node.js + Express 5 + TypeScript | `server/` workspace |
| Auth | Microsoft Entra ID via MSAL (authorization code + PKCE) -> access token verified server-side -> our own session cookie | See **How sign-in works** |
| Database | Neon serverless PostgreSQL, via `pg` | Migrations are numbered `.sql` files |
| Repo | npm workspaces monorepo | `npm install` once at the root |

Deliberately conventional, so that documentation and examples are abundant —
this is a mitigation for the risk that none of us has built a full-stack
application end to end before.

TypeScript is used in both workspaces with `strict` on, and `npm run typecheck`
at the root must pass before anything is merged.

## Planned feature set

| ID | Feature | Priority |
|---|---|---|
| F1 | University email sign-up and verification | Must have |
| F2 | Student profile (major, year, campus, study style) | Must have |
| F3 | Course selection from a controlled catalog | Must have |
| F4 | Course-scoped group discovery with filters | Must have |
| F5 | Create a group (day, time, location, size cap, goal) | Must have |
| F6 | Join or request to join | Must have |
| F7 | Group page (roster, sessions, announcements) | Must have |
| F8 | Report and moderation tools | Should have |
| F9 | In-app group messaging | Could have |
| F10 | Polls, shared notes, to-do lists, exam dates | Not this release |

## Roadmap

| Iteration | Delivers | Retires |
|---|---|---|
| 1 — Elaboration | Sign-up, course selection, browse seeded groups | Catalog data quality, email verification |
| 2 — Construction I | Create group, join / request, profiles | Cold start — ends with a live pilot in one real course section |
| 3 — Construction II | Group page, moderation tools | Harassment and moderation |
| 4 — Transition | Hardening, deployment | Hosting reliability |

## Repository layout

```
docs/                    project deliverables (inception document, slides)

scripts/
  dev.mjs                `npm run up` — install, configure, migrate, start

client/                  Vite + React + TypeScript single-page app
  index.html             the SPA entry. No provider script to load — MSAL is
                         library code in our own bundle
  redirect.html          the MSAL redirect bridge, and nothing else. The
                         sign-in popup lands here
  vite.config.ts         dev server; proxies /api to the Express server; two
                         build entries (the app and the bridge)
  src/
    main.tsx             creates and awaits the MSAL instance, then renders.
                         With no client ID it renders the app anyway, so the
                         dev bypass is reachable before Entra is registered
    App.tsx              routes: /login and / (guarded)
    api.ts               the only place that calls fetch; AuthUser type
    styles.css           all styling, tokens in :root
    auth/
      msal.ts            the MSAL instance: authority, redirect URI, cache
      auth-context.ts    the context object and its value type
      AuthProvider.tsx   holds "who is signed in"; owns sign-in and sign-out
      useAuth.ts         the hook components use
      RequireAuth.tsx    route guard -> /login when signed out
    components/
      EntraSignInButton.tsx  an ordinary button — MSAL ships no widget
      Avatar.tsx         profile picture with an initials fallback
      EmptyState.tsx     honest "not built yet" block
      Wordmark.tsx       inline-SVG logo
      FullPageSpinner.tsx
      icons.tsx
    pages/
      LoginPage.tsx      sign-in screen
      HomePage.tsx       signed-in landing page
    types/
      vite-env.d.ts      typings for the VITE_ variables

server/                  Express + TypeScript API
  migrations/
    001_create_users.sql the users table
  src/
    index.ts             listen, startup warnings, graceful shutdown
    app.ts               middleware wiring and route mounting
    env.ts               reads and validates every environment variable
    errors.ts            HttpError: status + code + safe message
    entra.ts             verifies the Entra access token, applies the tenant policy
    session.ts           session JWT and cookie attributes
    users.ts             the users table: upsert and lookup
    dev-login.ts         development sign-in bypass — remove before the pilot
    db/pool.ts           pg Pool, TLS, and the deliberate "no database" path
    middleware/
      require-auth.ts    auth middleware for protected routes
      csrf.ts            custom-header + Origin check on unsafe methods
      error-handler.ts   one JSON error shape, 404 handler
    routes/auth.ts       POST /api/auth/entra, GET /me, POST /logout, GET /config
    scripts/migrate.ts   the migration runner
```

---

## How sign-in works

Feature **F1**. The short version: Microsoft proves who the student is, the
server decides whether that student is allowed in, and then the server issues
its own session.

**Why Microsoft and not Google.** A UTA account *is* a Microsoft identity:
`@mavs.uta.edu` and `@uta.edu` both resolve to one Microsoft Entra ID tenant.
Signing in with Google would have meant depending on a Google Workspace domain
the university does not run, so "sign in with your UTA account" and "sign in
with Google" were never the same thing. The first version of this code used
Google Identity Services; it was replaced, and the two places where the change
is more than a rename are called out below.

1. MSAL — in our own bundle, no script loaded from the provider — opens a popup
   to UTA's Microsoft sign-in page.
2. The student signs in. MSAL runs the OAuth 2.0 **authorization code flow with
   PKCE**: it generates the code challenge and redeems the code at the token
   endpoint itself.
3. The popup lands on `/redirect.html`, whose only job is MSAL's redirect
   bridge. Since MSAL v5 that page is required: `Cross-Origin-Opener-Policy`
   severs `window.opener`, so the bridge hands the response back to the app's
   tab over a `BroadcastChannel` instead. It loads no router and no app code,
   which is why it is a second Vite entry rather than a route.
4. The token MSAL asks for is an **access token for this app's own API scope**,
   `api://<client-id>/access_as_user` — not an ID token.
5. The client POSTs that access token to `POST /api/auth/entra`.
6. The server verifies it with `jose` against UTA's **tenant-scoped** key set:
   RS256 signature, then `iss`, `aud`, `exp` and `nbf`.
7. It then applies the checks a signature cannot make: `ver` must be `2.0`,
   `tid` must be UTA's tenant, `scp` must contain `access_as_user`, and `oid`
   must be present.
8. The user row is inserted (or refreshed) keyed on the pair (`tid`, `oid`).
9. The server signs a small session JWT and returns it in an **httpOnly**
   cookie. The Microsoft access token is discarded.

Three decisions worth knowing about, because they are the ones people ask about.

**Why an access token and not an ID token.** Microsoft's guidance here is the
opposite of Google's, and getting it backwards is the common mistake: "You
shouldn't use an ID token to call an API", and a web API "must only accept
tokens containing one of their AppId URIs as the `aud` claim". So the SPA
acquires a token for the scope this app publishes under **Expose an API**, the
server verifies that, and the ID token stays in the browser where it belongs.
Class Meet reads nothing from Microsoft — no Graph, no Outlook, no Calendar —
so no other scope is requested. If a later iteration wants the student's
calendar, that is a *separate*, incremental consent step, not a change to
sign-in.

**Why the tenant ID is the access policy, and not the email domain.** The
Google version of this file matched the address against a domain allowlist.
That cannot be carried over, and should not be: Entra has no `email_verified`
claim to lean on, and documents `email`, `upn` and `preferred_username` as
mutable and explicitly not for authorization decisions. What Microsoft *does*
sign is `tid`, the immutable tenant ID of the organisation the student signed
in to — "always check that the `tid` in a token matches the tenant ID used to
store data with the application". A student cannot present UTA's `tid` without
a UTA account, which is a far stronger statement than "their address ends in
uta.edu". The policy is enforced in `server/src/entra.ts` and nowhere else.

A rejected tenant looks like this:

```
403 {"error":{"code":"tenant_not_allowed","message":"Class Meet is only open to
The University of Texas at Arlington accounts. The account you signed in with
belongs to a different organisation. Sign in again with your UTA account (the
one ending in @mavs.uta.edu or @uta.edu)."}}
```

The tenant-specific authority in `client/src/auth/msal.ts` sends students
straight to the sign-in page they already know, but that is a convenience: a
client can be pointed anywhere, so the boundary is the server's `tid` check.

**Why `oid` and not the email is the account key.** `oid` is immutable and
never reused, and Microsoft's advice is blunt: "your application mustn't use
human-readable data to identify a user". The key is the *pair* (`tid`, `oid`),
because `oid` is only unique within a tenant — so opening Class Meet to a
second university later does not require a schema change. The email is stored
for display and is still `UNIQUE`, so one address cannot end up on two rows,
but an account survives the student's address changing.

**Session cookie.** `httpOnly` (so an XSS bug cannot read it, which is the
thing `localStorage` cannot promise), `sameSite=Lax`, `secure` in production,
and an expiry that matches the JWT's own `exp` so a cookie the browser still
holds is never a session the server accepts. `SameSite` is defence in depth
rather than a complete CSRF defence, so every unsafe method also requires the
custom `X-Class-Meet` header (which a cross-origin form cannot set) and a
recognised `Origin`. There is no refresh token: when the session expires the
student presses the button again, which — because the browser still holds a
live Microsoft session — is usually one click and no password prompt.

**Signing out signs you out of Class Meet only.** `signOut` clears MSAL's
tab-scoped token cache; it deliberately does *not* call `logoutPopup`, which
would end the student's Microsoft session everywhere. Leaving a study-group app
should not sign someone out of their university email.

---

## Running the app

You need **Node.js 22.12 or newer** (`node -v`) and a Microsoft work or school
account. You do not need Docker or a local Postgres. You do need a tenant you
can register an application in — see the note at the end of step 1.

```bash
npm install     # once, at the repo root — installs both workspaces
```

### 1. Register the app in Microsoft Entra ID

1. Go to <https://portal.azure.com/> and sign in, then open **Microsoft Entra
   ID -> App registrations -> New registration**.
2. Name it `Class Meet`.
3. Supported account types: **Accounts in any organizational directory (Any
   Microsoft Entra ID tenant — Multitenant)**. Which organisation is actually
   allowed in is decided by the `tid` check on the server, not by this setting;
   leaving the registration multi-tenant is what lets the app be pointed at a
   throwaway tenant for testing without re-registering it.
4. **Redirect URI**: choose the platform **Single-page application (SPA)** and
   enter, exactly:

   ```
   http://localhost:5173/redirect.html
   ```

   The platform type matters. Only **SPA** turns on CORS at the token endpoint,
   which is what lets MSAL redeem the PKCE code from the browser; an otherwise
   identical URI added under **Web** fails at redemption with a CORS error. If
   anyone on the team opens the app at `127.0.0.1`, add
   `http://127.0.0.1:5173/redirect.html` as well, under **Authentication**.
5. **Expose an API** -> accept the default Application ID URI
   `api://<client-id>` -> **Add a scope**:
   - Scope name: `access_as_user` — it must match `ENTRA_API_SCOPE`
   - Who can consent: **Admins and users**
   - Fill in the display names and descriptions, then **Add scope**.

   The server requires this scope in the token's `scp` claim, so a token
   without it is refused even if everything else about it is valid.
6. **API permissions -> Add a permission -> My APIs -> Class Meet ->
   `access_as_user` -> Add permissions**. Declaring the app's own scope here
   means consent is asked once, up front.
7. **Token configuration -> Add optional claim -> Access token**, and tick
   `email` (and `upn`, if it is offered). Entra includes no address by default,
   and without one the server answers `403 email_missing`.
8. Open **Overview** and copy the **Application (client) ID** (a GUID). You do
   **not** need a client secret — a single-page app is a public client and
   cannot keep one, so nothing in this codebase uses one.

> **If you registered the app in your own tenant rather than UTA's**, copy the
> **Directory (tenant) ID** from the same Overview page and set
> `UTA_TENANT_ID` in `server/.env` and `VITE_ENTRA_TENANT_ID` in `client/.env`
> to it. Otherwise the server refuses your own sign-in with
> `403 tenant_not_allowed` — correctly, because you are not UTA. Putting the
> UTA defaults back is how you point it at UTA.

### 2. Create the Neon database

1. Go to <https://console.neon.tech/> and sign up (the free tier is enough).
2. Create a project — name it `class-meet`, any region near Texas.
3. Open **Dashboard -> Connect** (or **Connection Details**) and copy the
   connection string for the `neondb` database. It looks like:

   ```
   postgresql://USER:PASSWORD@ep-something-a1b2c3-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

4. Copy **both** forms of it:
   - the **pooled** string — hostname contains `-pooler` — for `DATABASE_URL`
   - the **direct** string — same hostname with `-pooler` removed, shown when
     you untick "Pooled connection" — for `DIRECT_DATABASE_URL`

   The pooled endpoint is what a web server should use; the direct endpoint is
   what migrations and other DDL should use, because transaction pooling does
   not fully support them.

### 3. Fill in the environment files

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Then edit them. Both files are git-ignored; never commit a filled-in one.

| File | Variable | Where it comes from |
|---|---|---|
| `server/.env` | `ENTRA_CLIENT_ID` | Step 1, the Application (client) ID |
| `server/.env` | `UTA_TENANT_ID` | Already set to UTA's tenant. Change it only if you registered the app elsewhere |
| `server/.env` | `ENTRA_API_SCOPE` | Already set to `access_as_user`. Must match the scope published in step 1.5 |
| `server/.env` | `SESSION_SECRET` | Generate it (below). Any long random string. |
| `server/.env` | `DATABASE_URL` | Step 2, the **pooled** connection string |
| `server/.env` | `DIRECT_DATABASE_URL` | Step 2, the **direct** connection string |
| `server/.env` | `CLIENT_ORIGIN` | Already set to `http://localhost:5173` |
| `server/.env` | `PORT`, `NODE_ENV`, `SESSION_TTL_DAYS` | Defaults are fine |
| `server/.env` | `ALLOW_DEV_LOGIN` | Leave it unset unless you need **Working before Entra and Neon exist**, below |
| `client/.env` | `VITE_ENTRA_CLIENT_ID` | Step 1 — the **same** client ID |
| `client/.env` | `VITE_ENTRA_TENANT_ID` | Already set to UTA's tenant, as above |

Generate the session secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

The client ID must be identical in both files. The server checks the access
token's `aud` claim against its copy, so a mismatch would otherwise show up as
a `401` from a token that looks perfectly valid; the login page compares the
two on load and says so in a sentence instead.

### 4. Run the migrations

```bash
npm run migrate          # apply anything not yet applied
npm run migrate:status   # or just list what is applied and what is pending
```

This creates the `users` table and a `schema_migrations` table that records
what has run. It is safe to run repeatedly.

To change the schema, add a new file — `server/migrations/002_whatever.sql` —
and run `npm run migrate` again. Never edit a migration that has already been
applied: the runner will not notice, and everyone's database will drift apart.
There are no `down` migrations on purpose; to undo something, add a numbered
file that undoes it.

### 5. Start it

```bash
npm run up
```

One command for all of the above: it checks your Node version, installs
dependencies if they are missing, creates either `.env` file if it is absent,
generates `SESSION_SECRET`, copies the client ID across if only the server has
it, runs any pending migrations when a database is configured, and then starts
both dev servers. It never overwrites a value you have already set, so running
it twice does the same thing as running it once. `npm run up -- --check` does
the checks and a typecheck without starting anything.

If you would rather drive it yourself, `npm run dev` still starts just the two
servers and nothing else.

Either way that runs both workspaces at once: the API on <http://localhost:4000> and the
app on <http://localhost:5173>. Open the second one. Everything the browser
requests under `/api` is proxied to the API, so the browser only ever sees one
origin and the session cookie is a plain first-party cookie — the same shape it
will have in production.

The server takes a few seconds longer to come up than Vite does. If the first
page load reports that it cannot reach the server, wait for
`[api] Class Meet API listening` in the terminal and reload.

### Working before Entra and Neon exist

Registering the app and creating the Neon project are both blocked on things
outside the code, and until they exist nobody can get past the login screen. So
there is a development sign-in bypass — **iteration-1 scaffolding that is
removed before the pilot**.

`npm run up` switches it on for you when no `ENTRA_CLIENT_ID` is configured,
and says so. To do it by hand, add this to `server/.env`:

```
ALLOW_DEV_LOGIN=true
```

and restart. The login page then shows **Skip sign-in (development only)**,
which signs you in as a hard-coded fake student (`dev.student@mavs.uta.edu`)
with no Microsoft account and no database.

What keeps it from being a hole:

- Two independent gates: `NODE_ENV` must not be `production` **and**
  `ALLOW_DEV_LOGIN` must be exactly `true`. Unset is off.
- Setting both `NODE_ENV=production` and the flag makes the server **refuse to
  boot**. A deployment that fails loudly beats one that silently accepts
  unauthenticated sign-ins.
- The endpoint takes no request body, so it cannot be used to become an
  arbitrary user — the identity is a server-side constant.
- It writes nothing. The session is marked `dev` and `GET /api/auth/me` answers
  it from that constant, so no fake row ever reaches Postgres.
- The button appears only when the *server* says the flag is on, so a
  production bundle cannot show a button the server would honour.

To remove it: delete `server/src/dev-login.ts` and the call sites listed in its
header comment (`env.ts`, `routes/auth.ts`, `index.ts`, and the block in
`client/src/pages/LoginPage.tsx`).

### Other scripts

| Command (from the repo root) | What it does |
|---|---|
| `start.bat` (double-click it) | The same as `npm run up`, from File Explorer, without opening a terminal first |
| `npm run up` | Everything: checks, install, `.env` setup, migrations, then both dev servers |
| `npm run up -- --check` | The same checks plus a typecheck, without starting anything |
| `npm run dev` | Both dev servers, with reload — no checks, no setup |
| `npm run typecheck` | `tsc --noEmit` over both workspaces |
| `npm run build` | Compiles the server to `server/dist`, bundles the client to `client/dist` |
| `npm run migrate` | Applies pending migrations |
| `npm run migrate:status` | Lists applied and pending migrations, changes nothing |
| `npm start` | Runs the compiled server (needs `npm run build` first) |

### Troubleshooting

| Symptom | Cause |
|---|---|
| The login page loads, but pressing sign-in says the server has no app registration | `ENTRA_CLIENT_ID` is not set in `server/.env`. The app still runs on purpose, so the dev bypass is usable |
| "Could not reach Microsoft sign-in" before the login screen | No network, or `VITE_ENTRA_CLIENT_ID` is set to a client ID that does not exist |
| The login page says the two client IDs disagree | `ENTRA_CLIENT_ID` and `VITE_ENTRA_CLIENT_ID` differ, or the server was not restarted after editing `.env` |
| `503 entra_not_configured` | `ENTRA_CLIENT_ID` is empty. The server boots without it on purpose, but sign-in needs it |
| An MSAL error naming the redirect URI | The registered URI is not exactly `http://<the host in the address bar>:5173/redirect.html` |
| A CORS error as the popup closes | The redirect URI was added under the **Web** platform. It must be **Single-page application** |
| The popup opens, closes, and nothing happens | `redirect.html` is not being served — check that both Vite build entries are present |
| "Your browser blocked the Microsoft sign-in window" | A pop-up blocker. Allow pop-ups for the site |
| `401 invalid_entra_token` | A token for another audience or tenant, a v1.0 token, or a clock more than a minute out |
| `403 tenant_not_allowed` | A personal or other-organisation account — or the app is registered in your own tenant and `UTA_TENANT_ID` was not changed to match |
| `403 scope_missing` | `access_as_user` was not published under **Expose an API**, or `ENTRA_API_SCOPE` does not match its name |
| `403 email_missing` | `email` is not an optional claim on the **access token** (step 1.7) |
| `403 object_id_missing` | The token has no `oid` — an app-only token. Sign in as yourself |
| `403 csrf_header_missing` or `403 origin_not_allowed` | A request that did not go through `client/src/api.ts`, or `CLIENT_ORIGIN` does not list the origin you are browsing from |
| `503 database_not_configured` | `DATABASE_URL` is empty. The server boots without it on purpose, but sign-in needs it |
| `503 database_not_migrated` | The database is reachable but `npm run migrate` has not run |
| `503 database_unavailable` | Wrong connection string, or the Neon compute is asleep — retry once |
| Vite prints `http proxy error: ECONNREFUSED` | The API is not up yet, or `PORT` in `server/.env` is not `4000` |

---

## What is actually built

Iteration 1 is in progress. As of now:

| Feature | State |
|---|---|
| F1 — university sign-in with a UTA Microsoft account | **Done** |
| Signed-in home screen (shell, with honest empty states) | **Done** |
| F2–F10 | Not started |

The home screen deliberately shows the shape of the product — "your courses"
and "study groups in your courses" — with empty states that say which iteration
fills them in. It shows no seeded or placeholder groups, because a demo that
looks finished and is not is worse than one that is honest.

One piece of scaffolding is in the tree on purpose, and is tracked for removal:
the development sign-in bypass described above. It exists because the Entra app
registration and the Neon project are prerequisites the team does not all have
yet, and it is deleted before the iteration-2 pilot.
