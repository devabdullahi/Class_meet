#!/usr/bin/env node
/**
 * One command that gets Class Meet running end to end: `npm run up`.
 *
 * It exists because starting this project from a fresh clone means doing six
 * unrelated things in the right order (install, two .env files, a generated
 * secret, migrations, two dev servers), and getting any of them wrong produces
 * an error a long way from its cause. Everything here is something a person
 * would otherwise do by hand from the README.
 *
 * Two rules it follows:
 *
 *  1. It is idempotent and never clobbers configuration. A value already in
 *     a .env file is left exactly as it is — the script only ever fills in
 *     what is missing, so running it twice is the same as running it once,
 *     and it cannot overwrite a real credential with a placeholder.
 *  2. It prints what it decided. A script that silently changes config is
 *     worse than no script, because the next failure has an invisible cause.
 *
 * Written in Node rather than as a shell script so that one file works in
 * PowerShell, cmd and bash without a second copy to keep in step. Node 22 is
 * already a prerequisite of the project.
 *
 * Usage:
 *   npm run up            install, configure, migrate, then start both servers
 *   npm run up -- --check the same checks plus a typecheck, without starting
 *                         anything. Useful before pushing.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Matches `engines.node` in package.json. Vite 8 and Express 5 both need it. */
const MINIMUM_NODE = { major: 22, minor: 12 };

/** 48 bytes of base64url comfortably clears the server's 32-character floor. */
const SESSION_SECRET_BYTES = 48;

const APP_URL = 'http://localhost:5173';

const paths = {
  nodeModules: path.join(repoRoot, 'node_modules'),
  serverEnv: path.join(repoRoot, 'server', '.env'),
  serverEnvExample: path.join(repoRoot, 'server', '.env.example'),
  clientEnv: path.join(repoRoot, 'client', '.env'),
  clientEnvExample: path.join(repoRoot, 'client', '.env.example'),
};

const checkOnly = process.argv.includes('--check');

/** Collected as we go and printed as one block at the end. */
const notes = [];

function step(message) {
  console.log(`\n\u001b[1m> ${message}\u001b[0m`);
}

function info(message) {
  console.log(`  ${message}`);
}

function note(message) {
  notes.push(message);
  console.log(`  ! ${message}`);
}

function fail(message) {
  console.error(`\n\u001b[31mCannot start: ${message}\u001b[0m\n`);
  process.exit(1);
}

/**
 * Runs a command with its output attached to this terminal, so the dev servers
 * behave exactly as they do when run by hand. `shell: true` is what makes
 * `npm` resolve to `npm.cmd` on Windows.
 */
function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: repoRoot, stdio: 'inherit', shell: true });
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

// --- environment files -----------------------------------------------------

/**
 * Reads the value of a key, ignoring commented-out lines. Returns null when
 * the key is absent, commented, or present but empty — all three mean "not
 * configured" to the server, so callers do not have to tell them apart.
 */
function readValue(text, key) {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    if (trimmed.slice(0, separator).trim() !== key) continue;

    const value = trimmed.slice(separator + 1).trim();
    return value.length > 0 ? value : null;
  }
  return null;
}

/**
 * Sets a key, preferring to edit in place so the explanatory comments in
 * .env.example stay attached to the value they describe: an active line is
 * replaced, a commented-out one is activated where it sits, and only a key
 * that appears nowhere is appended.
 */
function withValue(text, key, value) {
  const lines = text.split(/\r?\n/);

  const activeAt = lines.findIndex((line) => {
    const trimmed = line.trim();
    return !trimmed.startsWith('#') && trimmed.startsWith(`${key}=`);
  });
  if (activeAt !== -1) {
    lines[activeAt] = `${key}=${value}`;
    return lines.join('\n');
  }

  const commentedAt = lines.findIndex((line) =>
    /^#\s*[A-Z_]+=/.test(line.trim()) && line.trim().replace(/^#\s*/, '').startsWith(`${key}=`),
  );
  if (commentedAt !== -1) {
    lines[commentedAt] = `${key}=${value}`;
    return lines.join('\n');
  }

  const separator = text.endsWith('\n') ? '' : '\n';
  return `${text}${separator}${key}=${value}\n`;
}

function ensureEnvFile(target, example, label) {
  if (existsSync(target)) return;

  if (!existsSync(example)) {
    fail(`${label} is missing and so is its .env.example. The checkout is incomplete.`);
  }
  copyFileSync(example, target);
  info(`created ${label} from .env.example`);
}

// --- checks ----------------------------------------------------------------

function checkNodeVersion() {
  step('Checking Node.js');

  const [major, minor] = process.versions.node.split('.').map(Number);
  const tooOld =
    major < MINIMUM_NODE.major || (major === MINIMUM_NODE.major && minor < MINIMUM_NODE.minor);

  if (tooOld) {
    fail(
      `Node ${process.versions.node} is too old. This project needs ` +
        `${MINIMUM_NODE.major}.${MINIMUM_NODE.minor} or newer — see https://nodejs.org/.`,
    );
  }
  info(`Node ${process.versions.node}`);
}

async function ensureDependencies() {
  step('Checking dependencies');

  if (existsSync(paths.nodeModules)) {
    info('node_modules is present');
    return;
  }

  info('node_modules is missing, running npm install (this takes a minute)');
  const code = await run('npm', ['install']);
  if (code !== 0) {
    fail('npm install failed. Scroll up for the reason.');
  }
}

/**
 * Fills in what can be generated or copied, and decides how sign-in will work.
 * Returns what the caller needs for the summary.
 */
function configureEnvironment() {
  step('Checking configuration');

  ensureEnvFile(paths.serverEnv, paths.serverEnvExample, 'server/.env');
  ensureEnvFile(paths.clientEnv, paths.clientEnvExample, 'client/.env');

  let serverText = readFileSync(paths.serverEnv, 'utf8');
  let clientText = readFileSync(paths.clientEnv, 'utf8');
  const originalServerText = serverText;
  const originalClientText = clientText;

  // A secret nobody has to think about. It is only a signing key for our own
  // session cookie, so a generated one is strictly better than a chosen one.
  if (readValue(serverText, 'SESSION_SECRET') === null) {
    serverText = withValue(
      serverText,
      'SESSION_SECRET',
      randomBytes(SESSION_SECRET_BYTES).toString('base64url'),
    );
    info('generated SESSION_SECRET');
  }

  const serverClientId = readValue(serverText, 'ENTRA_CLIENT_ID');
  const browserClientId = readValue(clientText, 'VITE_ENTRA_CLIENT_ID');

  // The client ID is public and the two files must agree, so a value present
  // on one side and missing on the other is a copy nobody should have to make.
  if (serverClientId !== null && browserClientId === null) {
    clientText = withValue(clientText, 'VITE_ENTRA_CLIENT_ID', serverClientId);
    info('copied ENTRA_CLIENT_ID into client/.env as VITE_ENTRA_CLIENT_ID');
  } else if (serverClientId !== null && browserClientId !== serverClientId) {
    note(
      'ENTRA_CLIENT_ID and VITE_ENTRA_CLIENT_ID are different. Microsoft would issue a token ' +
        'this server refuses — make both the Application (client) ID from the Azure portal.',
    );
  }

  const entraConfigured = serverClientId !== null;
  const nodeEnv = readValue(serverText, 'NODE_ENV') ?? 'development';
  const devLoginRequested = (readValue(serverText, 'ALLOW_DEV_LOGIN') ?? '').toLowerCase() === 'true';

  // No app registration means no way in at all, so turn on the bypass that
  // exists for exactly this. Never in production: the server refuses to boot
  // on that combination, and this script must not be the thing that trips it.
  let devLoginEnabled = devLoginRequested;
  if (!entraConfigured && nodeEnv !== 'production' && !devLoginRequested) {
    serverText = withValue(serverText, 'ALLOW_DEV_LOGIN', 'true');
    devLoginEnabled = true;
    note(
      'No Entra app registration is configured, so the development sign-in bypass was switched ' +
        'on (ALLOW_DEV_LOGIN=true in server/.env). It signs you in as a fake student. Remove it ' +
        'once real sign-in works, and before anything is deployed.',
    );
  }

  if (!entraConfigured && nodeEnv === 'production') {
    note(
      'NODE_ENV=production with no ENTRA_CLIENT_ID: nobody can sign in, and the bypass cannot ' +
        'be used in production. Set ENTRA_CLIENT_ID, or set NODE_ENV=development for local work.',
    );
  }

  if (serverText !== originalServerText) writeFileSync(paths.serverEnv, serverText);
  if (clientText !== originalClientText) writeFileSync(paths.clientEnv, clientText);

  const databaseUrl = readValue(serverText, 'DATABASE_URL');

  info(`sign-in: ${entraConfigured ? 'Microsoft Entra ID' : 'not configured'}`);
  info(`database: ${databaseUrl === null ? 'not configured' : 'configured'}`);
  info(`dev bypass: ${devLoginEnabled ? 'ON' : 'off'}`);

  return { entraConfigured, databaseConfigured: databaseUrl !== null, devLoginEnabled };
}

/**
 * Migrations need a database, and the app is designed to run without one, so a
 * missing DATABASE_URL is skipped rather than treated as a failure. A database
 * that is configured but unreachable is worth saying out loud, but it still
 * must not stop the dev servers — the sign-in screen is reachable regardless.
 */
async function migrate(databaseConfigured) {
  step('Checking database schema');

  if (!databaseConfigured) {
    info('DATABASE_URL is not set, skipping migrations');
    note(
      'Without a database, real sign-in returns 503 database_not_configured. Add your Neon ' +
        'connection string to server/.env and run this again. The dev bypass needs no database.',
    );
    return;
  }

  const code = await run('npm', ['run', 'migrate']);
  if (code !== 0) {
    note('Migrations did not finish. Sign-in will fail until they do — see the output above.');
    return;
  }
  info('schema is up to date');
}

async function typecheck() {
  step('Typechecking both workspaces');

  const code = await run('npm', ['run', 'typecheck']);
  if (code !== 0) {
    fail('Typecheck failed. See the errors above.');
  }
  info('no type errors');
}

function printSummary(state) {
  console.log('\n\u001b[1mReady.\u001b[0m');

  if (state.entraConfigured) {
    console.log('  Sign in with your UTA account.');
  } else if (state.devLoginEnabled) {
    console.log('  Use "Skip sign-in (development only)" on the login page.');
  }

  if (notes.length > 0) {
    console.log('\n\u001b[1mWorth knowing:\u001b[0m');
    for (const message of notes) {
      console.log(`  - ${message}`);
    }
  }

  console.log(`\nOpening on ${APP_URL} once Vite reports ready. Ctrl+C stops both servers.\n`);
}

async function main() {
  console.log('\n\u001b[1mClass Meet\u001b[0m');

  checkNodeVersion();
  await ensureDependencies();
  const state = configureEnvironment();
  await migrate(state.databaseConfigured);

  if (checkOnly) {
    await typecheck();
    console.log('\n\u001b[1mChecks passed.\u001b[0m Run `npm run up` to start the app.\n');
    if (notes.length > 0) {
      console.log('Worth knowing:');
      for (const message of notes) {
        console.log(`  - ${message}`);
      }
      console.log('');
    }
    return;
  }

  printSummary(state);

  step('Starting the API and the app');
  // Delegates to the existing script rather than reimplementing it, so there
  // is still one definition of how the dev servers start.
  const code = await run('npm', ['run', 'dev']);
  process.exit(code);
}

await main();
