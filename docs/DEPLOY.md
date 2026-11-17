# Deploying Class Meet to Render

This puts Class Meet on the internet at an address like
`https://class-meet-cse3311.onrender.com`, so classmates can sign in with a
code emailed to their UTA address and try it without installing anything.

It takes about 30 minutes the first time. You need:

- the GitHub repository (`devabdullahi/Class_meet`), with the branch you want to
  deploy pushed to GitHub;
- the Neon project the team already uses;
- a free Brevo account to send sign-in codes from (step 3);
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
7. Paste both somewhere private for step 4. They contain the database password:
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

## Step 3 — Set up sending sign-in emails

Students sign in with a 6-digit code emailed to their UTA address, so the
server needs a way to send email. Without one, a production server **refuses
to start** — on purpose, so codes can never end up in a log instead. It sends
through exactly one of two providers:

- **Brevo's email API (recommended, free, works on Render's free plan).** It
  sends over HTTPS. Render's free web services block the ordinary email ports
  (25, 465 and 587) since 26 September 2025
  ([Render changelog](https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports)),
  but not HTTPS, so this is the option that works on the **Free** instance
  type. Brevo's free plan sends up to 300 emails a day.
- **SMTP**, such as a Gmail account with an App Password. Good for local
  development, and on a **paid** Render instance or any host that allows SMTP.
  On Render's free plan every "Email me a code" would time out with
  `503 email_send_failed`.

### Brevo (recommended)

Use an email address made for the project (for example
`classmeet.uta@gmail.com`) rather than someone's personal one: it is the
address students see the code come from.

1. **Create a free Brevo account** at <https://www.brevo.com/> (**Sign up
   free**). Confirm your email address and answer the onboarding questions;
   the free plan is enough.
2. **Verify a sender address.** In Brevo, open the profile menu (top right) →
   **Senders, Domains & Dedicated IPs** → **Senders** → **Add a sender**. Enter
   `Class Meet` as the name and the project address, then click the link in the
   verification email Brevo sends to it. Brevo only sends from verified
   senders, so this exact address goes into `EMAIL_FROM` below. (Menu names
   move around; if yours differ, search Brevo's help for "add a sender".)
3. **Create an API key.** Profile menu → **SMTP & API** → **API Keys** (it may
   read **API Keys & MCP**) → **Generate a new API key**, name it
   `Class Meet on Render`, and copy it. It starts with `xkeysib-` and is shown
   **once**; if you lose it, delete it and generate another. It is a password:
   keep it private, never commit it. (An *SMTP key*, from the neighbouring
   tab, is a different thing and will not work here.)
4. Your values for step 4 are:

   | Key | Value |
   |---|---|
   | `EMAIL_PROVIDER` | `brevo` |
   | `BREVO_API_KEY` | the key from step 3.3 |
   | `EMAIL_FROM` | `Class Meet <the verified sender address>` |

5. **Try it locally first:** put the same three values in your own
   `server/.env` (with the `SMTP_` values blank), restart `npm run dev`, and
   sign in with your own UTA address. The server log says
   `sign-in codes ... are emailed through the Brevo API`. If the email lands in
   **Junk**, mark it as not junk; UTA's mail filter learns. Brevo's
   **Transactional** → **Logs** page shows every email it sent or refused.

### Gmail over SMTP (local development, or a paid instance)

1. Sign in to the Gmail account and open <https://myaccount.google.com/security>.
2. Under **How you sign in to Google**, turn on **2-Step Verification**. App
   Passwords do not exist until it is on.
3. Open <https://myaccount.google.com/apppasswords>, type `Class Meet` as the
   app name, and click **Create**. Copy the 16-character password; it is shown
   once.
4. Your values are:

   | Key | Value |
   |---|---|
   | `EMAIL_PROVIDER` | `smtp` |
   | `SMTP_HOST` | `smtp.gmail.com` |
   | `SMTP_PORT` | `465` |
   | `SMTP_SECURE` | `true` |
   | `SMTP_USER` | the Gmail address |
   | `SMTP_PASS` | the app password — **not** the account password |
   | `EMAIL_FROM` | `Class Meet <the same Gmail address>` — Gmail sends only as the signed-in account |

Any other SMTP service works the same way with its own host, port and login.
Brevo also offers SMTP (`smtp-relay.brevo.com`, port `587`, `SMTP_SECURE`
`false`, with an SMTP key), but on Render's free plan use its API as above.

Set one provider only: the server refuses to start with settings for both, or
with `EMAIL_PROVIDER` naming one whose values are incomplete, and says which
variables are missing.

## Step 4 — Create the web service on Render

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
   | **Instance Type** | **Free** (with Brevo's API from step 3). Choose a paid type only if you send through SMTP |

5. Under **Environment Variables**, add each row below with **+ Add
   Environment Variable** (or paste them all at once with **Add from .env**).

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | the **pooled** string from step 1.5 |
   | `DIRECT_DATABASE_URL` | the **direct** string from step 1.6 |
   | `SESSION_SECRET` | the value from step 2 |
   | `CLIENT_ORIGIN` | `https://<Name>.onrender.com` — your **Name** from step 4.4, no trailing slash. Step 5 checks it |
   | `EMAIL_PROVIDER` | `brevo` (step 3) |
   | `BREVO_API_KEY` | the Brevo API key from step 3 |
   | `EMAIL_FROM` | `Class Meet <the verified sender address>` from step 3 |

   Sending through SMTP on a paid instance instead? Use `EMAIL_PROVIDER` `smtp`
   and the SMTP values from step 3, and leave `BREVO_API_KEY` out.

   Do **not** add `ALLOW_DEV_LOGIN` (the server refuses to start in production
   with it on), and do not add `PORT` (Render sets it). The Microsoft
   variables are not needed; see **Optional — Microsoft sign-in** below.

6. Click **Advanced** and set **Health Check Path** to `/api/health`. Leave the
   rest as it is.
7. Click **Deploy Web Service**.

The first build takes 3–6 minutes. The log should end with lines like:

```
[migrate] applying 001_create_users.sql
...
[migrate] applied 8 migration(s)
[api] serving the client from /app/client/dist
[api] Class Meet API listening on http://localhost:10000 (production)
[api] sign-in codes for @mavs.uta.edu, @uta.edu addresses are emailed through the Brevo API
==> Your service is live
```

(The `localhost` in that line is the address inside the container; Render
forwards your public `https://` address to it.)

## Step 5 — Check the address, and fix `CLIENT_ORIGIN` if Render changed it

At the top of the service page, under its name, Render shows the real address,
e.g. `https://class-meet-cse3311.onrender.com`. If the name was taken, Render
adds a suffix (`https://class-meet-cse3311-x7k2.onrender.com`).

If it differs from what you entered for `CLIENT_ORIGIN`: open **Environment**
in the left sidebar, edit `CLIENT_ORIGIN` to the exact address (with
`https://`, without a trailing `/`), and click **Save, rebuild, and deploy**.
Until it matches, signing in fails with `403 origin_not_allowed`.

## Step 6 — Check that it works

1. Open `https://<your-address>.onrender.com/api/health`. Expect:

   ```json
   {"ok":true,"env":"production","databaseConfigured":true}
   ```

2. Open `https://<your-address>.onrender.com/`. The Class Meet sign-in page
   appears.
3. Type your UTA email, click **Email me a code**, and enter the code from the
   email (check **Junk** the first time). Check you land on **My courses**.
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

   -- The starter catalog titles CSE 4316 "Computer Networks", but at UTA that
   -- is CSE 4344 (added above); CSE 4316 is Senior Design I. The title check
   -- makes this a no-op if the row has already been corrected.
   UPDATE courses SET title = 'Senior Design I'
   WHERE code = 'CSE 4316' AND title = 'Computer Networks';
   ```

The app reads the catalog live, so the new courses show up in **Add course**
straight away; no redeploy is needed.

---

## Optional — Microsoft sign-in

Microsoft sign-in is **off** unless `ENABLE_MICROSOFT_LOGIN=true`, because UTA's
tenant requires an administrator to approve the app before students can use
it ("Need admin approval"). If UTA grants that consent, turn it on:

1. Add these to the service's **Environment**, then **Save, rebuild, and deploy**
   (the two `VITE_` values are compiled into the browser code):

   | Key | Value |
   |---|---|
   | `ENABLE_MICROSOFT_LOGIN` | `true` |
   | `ENTRA_CLIENT_ID` | the Application (client) ID of the app registration |
   | `VITE_ENTRA_CLIENT_ID` | the **same** client ID again |
   | `UTA_TENANT_ID` | `5cdc5b43-d7be-4caa-8173-729e3b0a62d9` (UTA) |
   | `VITE_ENTRA_TENANT_ID` | the same tenant ID |
   | `ENTRA_API_SCOPE` | `access_as_user` |

2. Microsoft only returns a signed-in user to addresses listed on the app
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

The login page then shows **Sign in with Microsoft** under the email form.
Emailed codes keep working, and an address that signed in either way is the
same account.

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

Changing `VITE_ENTRA_CLIENT_ID` or `VITE_ENTRA_TENANT_ID` (Microsoft sign-in only) needs a rebuild,
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
| `EMAIL_PROVIDER` | yes (may be left out when only one provider's values are set) | runtime | `brevo` or `smtp`. Production refuses to start without exactly one complete provider |
| `EMAIL_FROM` | yes | runtime | The From line, e.g. `Class Meet <classmeet.uta@gmail.com>`. With Brevo, a verified sender; with Gmail, the account itself |
| `BREVO_API_KEY` | with `EMAIL_PROVIDER=brevo` | runtime | Brevo API key (`xkeysib-...`). Secret |
| `SMTP_HOST` | with `EMAIL_PROVIDER=smtp` | runtime | Outgoing mail server, e.g. `smtp.gmail.com`. Blocked on Render's free plan |
| `SMTP_PORT` | no (default `465`, or `587` with `SMTP_SECURE=false`) | runtime | `465` for TLS from the start, `587` for STARTTLS |
| `SMTP_SECURE` | no (default: `true` on 465) | runtime | `true` or `false`, matching the port |
| `SMTP_USER` | SMTP: with `SMTP_PASS` | runtime | The mail account's login (the Gmail address) |
| `SMTP_PASS` | SMTP: with `SMTP_USER` | runtime | Its password — for Gmail an **App Password**. Secret |
| `EMAIL_LOGIN_DOMAINS` | no (default `mavs.uta.edu,uta.edu`) | runtime | Which addresses may ask for a code; matched exactly after the `@` |
| `ENABLE_MICROSOFT_LOGIN` | no (default off) | runtime | `true` turns Microsoft sign-in on, together with `ENTRA_CLIENT_ID` |
| `ENTRA_CLIENT_ID` | only for Microsoft sign-in | runtime | Application (client) ID of the app registration |
| `ENTRA_API_SCOPE` | no (default `access_as_user`) | runtime | Scope name under **Expose an API** |
| `UTA_TENANT_ID` | no (default UTA) | runtime | The only tenant whose Microsoft accounts may sign in |
| `SESSION_TTL_DAYS` | no (default `7`) | runtime | How long a sign-in lasts |
| `PORT` | no — **leave unset** | runtime | Render provides it (`10000`) |
| `ALLOW_DEV_LOGIN` | **must be unset** | runtime | Development-only bypass. With `NODE_ENV=production` the server refuses to start |
| `VITE_ENTRA_CLIENT_ID` | only for Microsoft sign-in | **build** | Same client ID, compiled into the browser code. Not a secret |
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
| Deploy fails: `NODE_ENV=production without an email provider` | `EMAIL_PROVIDER`, `BREVO_API_KEY` and `EMAIL_FROM` are missing. Add them (step 3) |
| Deploy fails: `EMAIL_PROVIDER=brevo needs ...` | The message names the missing variable. Add it |
| Deploy fails: `... is set, but email goes through Brevo` (or `through SMTP`) | Values for both providers are set. Delete the ones for the provider you are not using |
| `503 email_send_failed`; the log says `Brevo refused the email: HTTP 401` | Wrong or deleted `BREVO_API_KEY` — or an SMTP key pasted instead of an API key. If the reason mentions an unrecognised IP address, Brevo's **Authorised IPs** protection is on: turn it off under **Security**, since Render's addresses change |
| `503 email_send_failed`; the log says `Brevo refused the email: HTTP 400` and mentions the sender | `EMAIL_FROM` is not a verified Brevo sender (step 3.2) |
| `503 email_send_failed` and the log says an SMTP connection timed out | SMTP on Render's **Free** instance type, which blocks it. Use Brevo's API (step 3) |
| `503 email_send_failed` and the log says `535` or `Invalid login` | Wrong `SMTP_USER`/`SMTP_PASS`. For Gmail, use an App Password, not the account password |
| The code never arrives | Look in **Junk**. Check the Render log for `could not send a sign-in code`, and Brevo's **Transactional** → **Logs** |
| Signing in fails with `403 origin_not_allowed` | `CLIENT_ORIGIN` is not exactly the address in the browser's address bar (step 5) |
| The Microsoft popup shows `AADSTS50011` / redirect URI mismatch | The `/redirect.html` URI is missing or mistyped in the portal (**Optional — Microsoft sign-in**) |
| A CORS error as the popup closes | The redirect URI was added under **Web** instead of **Single-page application** |
| The login page says the client IDs disagree (Microsoft sign-in on) | `ENTRA_CLIENT_ID` and `VITE_ENTRA_CLIENT_ID` differ. Fix one, then **Save, rebuild, and deploy** |
| `403 tenant_not_allowed` | A personal or non-UTA Microsoft account, or `UTA_TENANT_ID` differs from your working local value |
| Microsoft says "Need admin approval" | UTA's tenant does not let students consent to apps on their own — the reason sign-in uses emailed codes. Turn `ENABLE_MICROSOFT_LOGIN` off again unless UTA has granted admin consent |
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

Other values (database, secret, email provider) come from `server/.env`, and the app is
at <http://localhost:4100>. Production refuses to start without an email
provider, so `server/.env` needs one (step 3) for this rehearsal. Set
`ALLOW_DEV_LOGIN` to `false` explicitly rather than leaving it empty, so that a
`true` in `server/.env` does not stop the server from starting.

With Docker installed, the same image Render builds can be run with:

```bash
docker build -t class-meet .
docker run --rm -p 4100:4000 -e CLIENT_ORIGIN=http://localhost:4100 \
  -e SESSION_SECRET=<secret> -e DATABASE_URL=<connection-string> \
  -e EMAIL_PROVIDER=brevo -e BREVO_API_KEY=<api-key> \
  -e EMAIL_FROM="Class Meet <verified-sender>" class-meet
```
