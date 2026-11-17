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
| Phyo Ei Ko | @pek8504 |
| Jesus Martinez | |
| Shofi Shrestha | @sophieshrestha |

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
| Auth | One-time code emailed to a UTA address (Brevo's HTTPS API, or SMTP via `nodemailer`) -> our own session cookie. Microsoft Entra ID sign-in kept, off by default | See **How sign-in works** |
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
  DEPLOY.md              click-by-click deployment to Render + Neon
Dockerfile               the production image: migrate, then serve API + client

scripts/
  dev.mjs                `npm run up` — install, configure, migrate, start

client/                  Vite + React + TypeScript single-page app
  index.html             the SPA entry
  redirect.html          the MSAL redirect bridge, and nothing else. The
                         Microsoft sign-in popup lands here (when it is on)
  vite.config.ts         dev server; proxies /api to the Express server; two
                         build entries (the app and the bridge)
  src/
    main.tsx             renders the app; nothing to wait for first
    App.tsx              routes: /login and / (guarded)
    api.ts               the only place that calls fetch; AuthUser type
    styles.css           the design system: one dark token set on :root (two
                         hues: blue for actions, red for errors), type and
                         spacing scales, buttons, form controls, cards, dialog
    screens.css          layout of the shell and each screen, using those tokens
    groupForm.ts         Create Group's field rules (pure, unit-tested)
    groupFormat.ts       meeting times, seats left, next-meeting order
    courseLink.ts        course links (/join/CSE-3311): the code with its space as a hyphen
    chatLink.ts          which group chat links the form accepts (mirrors the server's list)
    emailSignIn.ts       the sign-in form's rules: allowed domains, the code, the countdown
    auth/
      msal.ts            the MSAL instance and its error wording; imported on
                         demand, only when the server turns Microsoft sign-in on
      entraClientId.ts   VITE_ENTRA_CLIENT_ID, readable without loading MSAL
      auth-context.ts    the context object and its value type
      AuthProvider.tsx   holds "who is signed in"; owns sign-in and sign-out
      useAuth.ts         the hook components use
      RequireAuth.tsx    route guard -> /login when signed out
    pending-requests/
      PendingRequestsProvider.tsx  join requests waiting for the signed-in leader,
                         refetched on navigation and after an answer; feeds the
                         "My groups" badge
      usePendingRequests.ts  the hook the layout and Group Details use
    moderation/
      ModerationStatusProvider.tsx  asks the server whether the student is a
                         moderator, and how many reports wait; feeds the
                         "Reports" item, which only moderators see
      useModerationStatus.ts  the hook the layout and the Reports page use
    reports/
      GroupReporting.tsx  Group Details' "Report group or member" button and
                         the "you reported this" notice
      ReportDialog.tsx   who, what is wrong, optional details
      GroupUnavailable.tsx  a missing group's page: "This group was removed"
                         when a moderator took it down, else "Group not found"
      reportWording.ts   reason and outcome wording, dates
    components/
      EmailCodeSignIn.tsx  the sign-in form: UTA email, then the emailed code
      EntraSignInButton.tsx  "Sign in with Microsoft", shown only when it is on
      Avatar.tsx         initials in a circle (there is no profile picture)
      ClassMeetLayout.tsx  the signed-in shell: sidebar, or top and tab bars on phones
      GroupForm.tsx      the group fields, inline errors and submit; creates a group or edits one
      FormField.tsx      label, control, then hint or error, wired with aria
      GroupActionPanels.tsx  Group Details' state-driven action panel
      RequesterProfile.tsx  a join request as the leader sees it: name and profile lines
      InlineConfirm.tsx  asks in place before leaving a group or removing a course
      ShareCourseLinkDialog.tsx  a course's link, ready to copy
      CopyLinkField.tsx  a link with Copy link; selects it for Ctrl+C where the clipboard is unavailable
      dialogKeys.ts      Tab stays inside a dialog; Escape closes it
      Wordmark.tsx       inline-SVG logo
      FullPageSpinner.tsx
      icons.tsx
    pages/
      LoginPage.tsx      sign-in screen
      MyGroupsPage.tsx   groups you lead, are in and asked to join; what needs you first
      JoinCoursePage.tsx what a course link opens: the course, its classmates and soonest
                         groups, and Add <code> to my courses
      EditGroupPage.tsx  the leader edits a group, using GroupForm
      ProfilePage.tsx    Your profile: the form beside "What leaders see"
      ModerationPage.tsx  Reports, for moderators: the queue and resolved decisions
      HomePage.tsx       signed-in landing page
    types/
      vite-env.d.ts      typings for the VITE_ variables

server/                  Express + TypeScript API
  migrations/
    001_create_users.sql the users table
    002_create_courses_and_groups.sql  courses, study_groups, group_members (+ 3 starter courses)
    003_create_enrollments_and_join_requests.sql  course_enrollments, group_join_requests
    004_add_group_name.sql  study_groups.name (NULL for groups made before it; the goal is shown instead)
    005_create_student_profiles.sql  student_profiles: major, year, where they can meet,
                         up to two study styles; no row = no profile
    006_add_group_chat_link.sql  study_groups.chat_link (optional; members only)
    007_add_reports_and_moderators.sql  users.is_moderator, reports (one open
                         per student per target), removed_groups
    008_create_email_login_codes.sql  email_login_codes: one hashed sign-in code
                         per address (users unchanged; see the file's comment)
  src/
    index.ts             listen, startup warnings, graceful shutdown
    app.ts               middleware wiring and route mounting; in production
                         also serves the built client
    static-client.ts     serves client/dist: SPA fallback, cache headers
    env.ts               reads and validates every environment variable
    errors.ts            HttpError: status + code + safe message
    entra.ts             verifies the Entra access token, applies the tenant policy;
                         whether Microsoft sign-in is on
    session.ts           session JWT and cookie attributes
    users.ts             the users table: upsert and lookup
    email-login/
      email-address.ts   which addresses may sign in, and their canonical form
      login-code.ts      making a code; its keyed hash; constant-time check
      email-delivery-config.ts  which provider sends codes (EMAIL_PROVIDER: brevo or
                         smtp); exactly one complete set, or none in development
      smtp-config.ts     reads SMTP_*; refuses a partial set
      mailer.ts          the email itself; Brevo API, SMTP, or [dev email] console lines
      repository.ts      the codes table and finding the account by email
                         (tested against PGlite in repository.test.ts)
    groups/
      validation.ts      rules for creating and editing a group (pure, unit-tested)
      visibility.ts      what outsiders may see: no online meeting links, no group chat links
      chat-link.ts       the group chat link allowlist: https invite links from GroupMe,
                         Discord, WhatsApp and Microsoft Teams only, no shorteners
      my-groups.ts       sorts a student's groups into led / member / requested (pure, unit-tested)
      repository.ts      all SQL for courses and groups, behind an interface
                         (tested against PGlite in repository.test.ts); a
                         requester's profile reaches only that group's leader
    profiles/
      validation.ts      the profile's fields and their allowed values (pure, unit-tested)
      repository.ts      the signed-in student's own profile: read, save, clear
                         (tested against PGlite in repository.test.ts)
    moderation/
      validation.ts      the report reasons and the details limit (pure)
      repository.ts      all SQL for reports, the queue and moderator decisions
                         (tested against PGlite in repository.test.ts)
    dev-login.ts         development sign-in bypass — remove before the pilot
    db/pool.ts           pg Pool, TLS, and the deliberate "no database" path
    db/pglite-test-database.ts  for tests: PGlite with the migrations applied
    middleware/
      require-auth.ts    auth middleware for protected routes
      csrf.ts            custom-header + Origin check on unsafe methods
      rate-limit.ts      per-key request limits, in memory, for sign-in
      security-headers.ts  Content-Security-Policy and friends, on every response
      error-handler.ts   one JSON error shape, 404 handler
    routes/email-login.ts  POST /api/auth/email/start and /verify: sign-in by emailed code
    routes/auth.ts       POST /api/auth/entra (off by default), GET /me, POST /logout, GET /config
    routes/me.ts         GET/POST /api/me/courses, DELETE /api/me/courses/:id
                         (refused while you lead or are in one of its groups;
                         withdraws your requests to its groups), GET /api/me/groups,
                         GET /api/me/groups/pending-request-count             (sign-in required)
    routes/profile.ts    GET/PUT /api/me/profile, your own profile only     (sign-in required)
    routes/courses.ts    GET /api/courses?q=, GET /api/courses/:id/groups (with the
                         classmate count), GET /api/courses/by-code/:code (a course
                         link: the course, added or not, classmates, groups)  (sign-in required)
    routes/course-links.ts  GET /api/course-links/:code — a course link's code and
                         title only, for its sign-in page               (no sign-in)
    routes/groups.ts     POST /api/groups, GET /api/groups/:id, PATCH and DELETE /api/groups/:id (leader), join requests
                         (ask, withdraw your own, leader decides),
                         DELETE /api/groups/:id/members/me (leave)           (sign-in required)
    routes/reports.ts    POST /api/groups/:id/reports, GET /api/groups/:id/reports/mine,
                         GET /api/groups/:id/removal                         (sign-in required)
    routes/moderation.ts GET /api/moderation/me (anyone signed in); the queue, keep
                         and remove under /api/moderation                    (moderators only)
    scripts/migrate.ts   the migration runner
```

---

## How sign-in works

Feature **F1**. Students sign in with a **one-time code emailed to their UTA
address**: they type `netid@mavs.uta.edu` (or `@uta.edu`), we email a 6-digit
code, they type it in, and the server issues its own session cookie. Proving
you can read mail sent to a UTA address is the access policy.

**Why not Microsoft.** A UTA account is a Microsoft identity, and the first
version of sign-in used it (it is still in the code — see **Microsoft sign-in**
below). But UTA's Microsoft tenant requires an administrator to approve every
third-party app, so students see "Need admin approval" and cannot consent to
Class Meet themselves. An emailed code needs nobody's approval and still
admits only people with a UTA mailbox.

1. The login page asks for the UTA email. It checks the domain against the
   list `GET /api/auth/config` sends, so a typo is caught without a round trip.
2. `POST /api/auth/email/start {email}` — the server normalises the address
   (trimmed, lowercased, plus tag removed), checks the domain **exactly**
   (`x@mavs.uta.edu.evil.com` is refused), stores a hash of a new code and
   emails the code.
3. The page asks for the code ("Enter the code we sent to …"), with **Resend
   code** after a one-minute countdown and **Change email**.
4. `POST /api/auth/email/verify {email, code}` — a correct code is deleted
   (single use), the account is found or created, and the server sets the same
   httpOnly session cookie Microsoft sign-in used to. The student goes back to
   the page they were sent from, `/join/...` course links included.

```
POST /api/auth/email/start  {"email":"jane@mavs.uta.edu"}
200 {"email":"jane@mavs.uta.edu","expiresInSeconds":600,"resendAfterSeconds":60}
400 email_not_allowed     not an @mavs.uta.edu / @uta.edu address
429 resend_too_soon       a code was sent less than a minute ago (retryAfterSeconds)
429 too_many_requests     a rate limit (retryAfterSeconds, Retry-After header)
503 email_send_failed     the mail server refused or timed out; retry at once

POST /api/auth/email/verify {"email":"jane@mavs.uta.edu","code":"042817"}
200 {"user":{...}}  + Set-Cookie: cm_session=...; HttpOnly; SameSite=Lax
400 code_invalid          not six digits (does not use up a try)
400 code_incorrect        wrong code; the message says how many tries are left
400 code_used_up          the fifth wrong code; the code is now dead
400 code_expired          expired, already used, replaced, or never sent
429 too_many_requests     a rate limit
```

**What keeps a six-digit code safe.** A million possible codes is a small
space; the limits around it make guessing hopeless. All of them are in
`server/src/routes/email-login.ts` and `server/src/email-login/`:

- **Random**: `crypto.randomInt`, the operating system's CSPRNG.
- **Never stored**: the `email_login_codes` table (migration 008) holds an
  HMAC-SHA256 of the address and code, keyed from `SESSION_SECRET`. An
  unkeyed hash — scrypt included — of one of a million values is reversed by
  trying them all; a keyed one is not, so a leaked copy of the table is
  useless. Checked with a constant-time comparison.
- **Ten minutes, once, five tries**: a correct code is deleted; the fifth wrong
  guess kills the code even if the sixth would have been right. Both are single
  SQL statements, so parallel requests cannot get extra guesses or reuse a code.
- **One code per address**: a new code replaces the old one, and at most one is
  sent a minute.
- **Rate limits** per client address and per email address on both endpoints
  (`EMAIL_LOGIN_RATE_LIMITS`). The per-client limits are generous because a
  lecture hall on campus Wi-Fi reaches us from a few NAT addresses; the
  per-email ones are tight. They are kept in memory, which is right for the one
  process Class Meet runs as — see **Known limits** below.
- **No account enumeration**: `start` never looks at the users table, and
  answers and emails every allowed address alike. The only refusal is a
  non-UTA domain, which says nothing about who has an account.
- **CSRF**: both endpoints are writes, under the same `X-Class-Meet` header and
  `Origin` check as every other.
- **No codes or keys in logs**: in development without an email provider the
  code is printed to the server console as a `[dev email]` line; in production
  the server **refuses to start** without one, so that fallback can never run
  there. Send failures are logged with the provider's reason, never the code or
  the API key.

**Plus-addressing is stripped**: `jane+cm@mavs.uta.edu` signs in as
`jane@mavs.uta.edu`, and the code goes there. Exchange delivers both to one
mailbox, so keeping the tag would let one student hold any number of accounts
(and dodge a moderator) by varying it.

**How accounts are matched.** By email (`users.email` is `UNIQUE` and
lowercase). A new address gets a new row with `provider_tenant_id = 'email'`
and `provider_object_id` = the address; the `users` table did not change. An
address that already belongs to an account — including one created by
Microsoft sign-in — signs in to **that** account, keeping its name, groups and
Microsoft identifiers. A new email account's name is made from the address
(`jane.doe@` becomes "Jane Doe"), since a code proves only the address.

**Sending the email.** `EMAIL_PROVIDER` picks one of two ways, and production
refuses to start unless exactly one is completely configured:

- `brevo` — Brevo's transactional email API
  ([`POST https://api.brevo.com/v3/smtp/email`](https://developers.brevo.com/reference/sendtransacemail)),
  called with Node's built-in `fetch` and a 10-second timeout. It goes out over
  HTTPS, so it works on Render's free plan, which blocks the SMTP ports. Free
  for 300 emails a day. Needs `BREVO_API_KEY` and a Brevo-verified `EMAIL_FROM`.
- `smtp` — any SMTP server through [`nodemailer`](https://nodemailer.com)
  (MIT-0, no dependencies), e.g. Gmail with an App Password. Fine locally and
  wherever SMTP is allowed.

A refusal, an error page or a timeout from either becomes `503
email_send_failed`, and the student can retry at once. Setup for both is in
`docs/DEPLOY.md`, step 3. The email is plain text with a minimal HTML twin:
the code, its expiry, and "If you didn't ask for this, ignore this email." No
links, images or tracking.

**Session cookie.** `httpOnly` (so an XSS bug cannot read it, which is the
thing `localStorage` cannot promise), `sameSite=Lax`, `secure` in production,
and an expiry that matches the JWT's own `exp` so a cookie the browser still
holds is never a session the server accepts. `SameSite` is defence in depth
rather than a complete CSRF defence, so every unsafe method also requires the
custom `X-Class-Meet` header (which a cross-origin form cannot set) and a
recognised `Origin`. There is no refresh token: when the session expires the
student signs in again.

**Known limits.** The rate limits live in one process's memory: a deployment
running several instances would give each its own count (the five-tries,
one-a-minute and single-use rules are in the database and hold regardless).
A new email account's name comes from the address, and there is no screen yet
for a student to change it.

### Microsoft sign-in (switched off)

The Microsoft Entra ID sign-in is still in the code, **off unless**
`ENABLE_MICROSOFT_LOGIN=true` **and** `ENTRA_CLIENT_ID` are both set on the
server. While it is off, `POST /api/auth/entra` answers `403
microsoft_login_disabled`, the login page shows no Microsoft button, and the
browser never downloads MSAL: `client/src/auth/msal.ts` is imported on demand
only when `GET /api/auth/config` reports `microsoftLoginEnabled: true`. If UTA
grants admin consent, turning it on adds **Sign in with Microsoft** under the
email form. How it works, for then:

1. MSAL — in our own bundle, no script loaded from the provider — opens a popup
   to UTA's Microsoft sign-in page and runs the OAuth 2.0 **authorization code
   flow with PKCE**.
2. The popup lands on `/redirect.html`, whose only job is MSAL's redirect
   bridge (required since MSAL v5, because `Cross-Origin-Opener-Policy` severs
   `window.opener`). It loads no router and no app code, which is why it is a
   second Vite entry rather than a route.
3. The token MSAL asks for is an **access token for this app's own API scope**,
   `api://<client-id>/access_as_user` — not an ID token. Microsoft: "You
   shouldn't use an ID token to call an API", and a web API "must only accept
   tokens containing one of their AppId URIs as the `aud` claim".
4. `POST /api/auth/entra` verifies it with `jose` against UTA's
   **tenant-scoped** key set (RS256 signature, `iss`, `aud`, `exp`, `nbf`), then
   requires `ver` 2.0, UTA's `tid`, the `access_as_user` scope and an `oid`.
5. The user row is inserted (or refreshed) keyed on the pair (`tid`, `oid`),
   and the same session cookie is issued.

The **tenant ID is the access policy** for this path, not the email domain:
Entra has no `email_verified` claim and documents `email`, `upn` and
`preferred_username` as mutable and not for authorization, while `tid` is
signed and immutable. A rejected tenant is `403 tenant_not_allowed`. The
account key is (`tid`, `oid`) because Microsoft's advice is "your application
mustn't use human-readable data to identify a user". Signing out clears MSAL's
tab-scoped cache but deliberately does not call `logoutPopup`, which would end
the student's Microsoft session everywhere.

---

## Running the app

You need **Node.js 22.22.2 or newer** (`node -v`) and a Neon database (step 2).
You do not need Docker, a local Postgres, a Microsoft account or a mail
server: in development, sign-in codes are printed in the server's terminal.

```bash
npm install     # once, at the repo root — installs both workspaces
```

### 1. Optional: register the app in Microsoft Entra ID

**Skip this step.** Microsoft sign-in is off unless `ENABLE_MICROSOFT_LOGIN=true`
(see **How sign-in works**), because UTA's tenant requires admin consent. It is
kept here for the day UTA grants it, or for testing in a tenant of your own.

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
| `server/.env` | `EMAIL_PROVIDER`, `EMAIL_FROM`, `BREVO_API_KEY`, `SMTP_*` | Leave blank locally: codes are printed in the server terminal as `[dev email]` lines. To send real email, see step 3 of [`docs/DEPLOY.md`](docs/DEPLOY.md) |
| `server/.env` | `EMAIL_LOGIN_DOMAINS` | Optional. Defaults to `mavs.uta.edu,uta.edu` |
| `server/.env` | `ENABLE_MICROSOFT_LOGIN`, `ENTRA_CLIENT_ID` | Leave unset. Only with step 1: `true` and the Application (client) ID |
| `server/.env` | `UTA_TENANT_ID` | Already set to UTA's tenant. Change it only if you registered the app elsewhere |
| `server/.env` | `ENTRA_API_SCOPE` | Already set to `access_as_user`. Must match the scope published in step 1.5 |
| `server/.env` | `SESSION_SECRET` | Generate it (below). Any long random string. |
| `server/.env` | `DATABASE_URL` | Step 2, the **pooled** connection string |
| `server/.env` | `DIRECT_DATABASE_URL` | Step 2, the **direct** connection string |
| `server/.env` | `CLIENT_ORIGIN` | Already set to `http://localhost:5173` |
| `server/.env` | `PORT`, `NODE_ENV`, `SESSION_TTL_DAYS` | Defaults are fine |
| `server/.env` | `ALLOW_DEV_LOGIN` | Leave it unset unless you need **Working before Neon exists**, below |
| `client/.env` | `VITE_ENTRA_CLIENT_ID` | Only with step 1 — the **same** client ID |
| `client/.env` | `VITE_ENTRA_TENANT_ID` | Already set to UTA's tenant, as above |

Generate the session secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

If you do turn Microsoft sign-in on, the client ID must be identical in both files. The server checks the access
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

To sign in, type any `@mavs.uta.edu` or `@uta.edu` address and press **Email
me a code**. Without an email provider configured nothing is sent; the
server's terminal prints the code instead:

```
[dev email] to jane.doe@mavs.uta.edu: Class Meet sign-in code 042817 (expires in 10 minutes)
```

### Working before Neon exists

Signing in with an emailed code stores the code and the account, so until the
Neon project exists nobody can get past the login screen. So there is a
development sign-in bypass — **iteration-1 scaffolding that is removed before
the pilot**.

`npm run up` switches it on for you when no `DATABASE_URL` is configured,
and says so. To do it by hand, add this to `server/.env`:

```
ALLOW_DEV_LOGIN=true
```

and restart. The login page then shows **Skip sign-in (development only)**,
which signs you in as a hard-coded fake student (`dev.student@mavs.uta.edu`)
with no email and no database.

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

### Moderators

Any student can report a group, or a member of one, from its page. Moderators
review those reports under **Reports** in the navigation, which only they see.
There is no screen for making someone a moderator, on purpose: it is one line
of SQL, run against the database (the Neon SQL editor in production), and the
person must have signed in once so their `users` row exists:

```sql
UPDATE users SET is_moderator = true WHERE email = 'someone@mavs.uta.edu';
```

Set it back to `false` to revoke it. Either takes effect on their next click,
because the server reads the flag on every moderation request rather than
from the session. In local development, the dev-login student's email is
`dev.student@mavs.uta.edu`.

What a moderator's decisions do:

- **Resolve** closes the reports and changes nothing else.
- **Remove group** deletes the group exactly as its leader's Delete group
  does (members and requests go with it) and keeps a `removed_groups` record,
  so anyone opening its old link reads "This group was removed" instead of
  "Group not found".
- **Remove from group** takes one member out; they may ask to join again,
  and the leader decides.

When a leader deletes their own group, its open reports leave the queue but
stay `open` in the database: no moderator decided them, and every resolved
report records the moderator who did.

Who reported what is visible to moderators only. A group's leader and members
never see reports about it, and a student sees only their own.

### Automated tests

Run them from the repository root. Neither needs a running server, a
database or a `.env` beyond the one `npm run up` creates:

```bash
npm run typecheck
npm test
```

- **Server** (`node:test` via `tsx`, `server/src/**/*.test.ts`): the pure
  rules (group validation, meeting-link visibility, My groups sorting), the
  Entra access policy, session tokens, the CSRF guard, the rate limiter and
  the error handler; every route against an in-memory repository; and
  `groups/repository.test.ts`, which runs the real SQL against
  [PGlite](https://pglite.dev) (Postgres compiled to WebAssembly, in-process)
  with the project's migrations applied: the seat cap, leaving, deleting a
  group, the remove-course rule, My groups, meeting-link privacy, and that a
  student's profile is shown to the leader of a group they asked to join
  and to no one else.
  `moderation/repository.test.ts` does the same for reports: one open report
  per target, the queue's order, and what removing a group or a member does.
  Email sign-in is tested the same way: the address rule, the code's hash,
  provider selection, SMTP settings, the Brevo request (against a stand-in
  `fetch`, including refusals and timeouts) and the email itself as pure units;
  `email-login/repository.test.ts` for the cooldown, five tries, expiry and
  matching an existing Microsoft account; and `routes/email-login.test.ts`,
  which drives both endpoints over HTTP against PGlite with a recording mail
  sender — wrong codes, expiry, single use, rate limits, the
  enumeration-safe answer and the session cookie. `env.test.ts` checks that
  production will not start without exactly one complete email provider.
- **Client** (Vitest, jsdom, Testing Library, `client/src/**/*.test.ts(x)`):
  form rules, calendar export, each page's states and actions, the
  navigation badge, both steps of email sign-in and their errors, that MSAL
  is not loaded while Microsoft sign-in is off, and the sign-in redirect
  when a session expires.

Check responsive layout and the native time picker manually in a browser.

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
| `npm start` | Runs the compiled server (needs `npm run build` first). With `NODE_ENV=production` it also serves the built client on the same port |

### Troubleshooting

| Symptom | Cause |
|---|---|
| No code arrives in development | Without an email provider nothing is emailed: look for the `[dev email]` line in the server's terminal |
| `503 email_send_failed` | Brevo or the mail server refused or timed out. The server log says why (e.g. `Brevo refused the email: HTTP 401` for a wrong API key; `535` for a wrong `SMTP_USER`/`SMTP_PASS`) |
| `429 resend_too_soon` | A code was sent to that address less than a minute ago. The page goes straight to entering it |
| `400 code_expired` | The code is over ten minutes old, was already used, was replaced by a newer one, or used up its five tries. Send a new one |
| The server will not start: `NODE_ENV=production without an email provider`, or `EMAIL_PROVIDER=... needs ...` | Production must email codes. Set one provider's variables (the message names what is missing), or `NODE_ENV=development` locally |
| `403 microsoft_login_disabled` | Microsoft sign-in is off. It needs `ENABLE_MICROSOFT_LOGIN=true` and `ENTRA_CLIENT_ID` |
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

## Deploying

The app deploys as one Docker container on Render's free plan, backed by a
fresh Neon database: the container runs pending migrations, then serves the
API and the built client from one origin. Follow
[`docs/DEPLOY.md`](docs/DEPLOY.md) step by step; it covers the Neon database,
the free Brevo account that sends sign-in codes (its HTTPS API works on
Render's free plan, which blocks SMTP), the Render service and its environment
variables, seeding more courses, and troubleshooting.

---

## What is actually built

Iteration 1 is in progress. As of now:

| Feature | State |
|---|---|
| F1 — university sign-in with a code emailed to a UTA address (Microsoft sign-in kept, off) | **Done** |
| Signed-in home screen (shell, with honest empty states) | **Done** |
| F2–F10 | Not started |

The home screen deliberately shows the shape of the product — "your courses"
and "study groups in your courses" — with empty states that say which iteration
fills them in. It shows no seeded or placeholder groups, because a demo that
looks finished and is not is worse than one that is honest.

One piece of scaffolding is in the tree on purpose, and is tracked for removal:
the development sign-in bypass described above. It exists because the Neon
project is a prerequisite the team does not all have yet, and it is deleted
before the iteration-2 pilot.
