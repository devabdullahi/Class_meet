/**
 * Finding the built client from wherever the server runs: `server/src` under
 * tsx, `server/dist` when compiled, and the Docker image, which keeps the
 * repo layout. What the router then serves is tested through the whole app
 * in `app.test.ts`.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { locateClientDist } from './static-client.js';

let repoRoot: string;
let distDir: string;

before(async () => {
  repoRoot = await mkdtemp(path.join(tmpdir(), 'class-meet-repo-'));
  distDir = path.join(repoRoot, 'client', 'dist');
  await mkdir(distDir, { recursive: true });
  await mkdir(path.join(repoRoot, 'server', 'src'), { recursive: true });
  await mkdir(path.join(repoRoot, 'server', 'dist', 'scripts'), { recursive: true });
  await writeFile(path.join(distDir, 'index.html'), '<!doctype html>');
});

after(async () => {
  await rm(repoRoot, { recursive: true, force: true });
});

describe('locateClientDist', () => {
  test('finds client/dist from server/src, as when run with tsx', () => {
    assert.equal(locateClientDist(path.join(repoRoot, 'server', 'src')), distDir);
  });

  test('finds client/dist from deeper compiled output', () => {
    assert.equal(locateClientDist(path.join(repoRoot, 'server', 'dist', 'scripts')), distDir);
  });

  test('returns null when the client has not been built', async () => {
    const unbuilt = await mkdtemp(path.join(tmpdir(), 'class-meet-unbuilt-'));
    try {
      // A dist directory without index.html is not a build.
      await mkdir(path.join(unbuilt, 'client', 'dist'), { recursive: true });
      await mkdir(path.join(unbuilt, 'server', 'src'), { recursive: true });
      assert.equal(locateClientDist(path.join(unbuilt, 'server', 'src')), null);
    } finally {
      await rm(unbuilt, { recursive: true, force: true });
    }
  });
});
