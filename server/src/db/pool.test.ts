import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPoolConfig } from './pool.js';

test('a Neon address keeps full certificate verification, and sslmode is decided in code', () => {
  const config = buildPoolConfig(
    'postgresql://owner:secret@ep-cool-name-123-pooler.us-east-2.aws.neon.tech/classmeet?sslmode=require&channel_binding=require',
  );
  assert.deepEqual(config.ssl, { rejectUnauthorized: true });
  assert.equal(
    config.connectionString,
    'postgresql://owner:secret@ep-cool-name-123-pooler.us-east-2.aws.neon.tech/classmeet',
  );
});

test("Render's external database address keeps full certificate verification", () => {
  const config = buildPoolConfig('postgresql://classmeet:secret@dpg-abc123-a.oregon-postgres.render.com/classmeet');
  assert.deepEqual(config.ssl, { rejectUnauthorized: true });
});

// The connectionString a Render Blueprint wires into DATABASE_URL. Its
// certificates are self-signed, so verifying them would refuse every
// connection and the deploy would never start.
test("Render's internal database address connects without TLS", () => {
  const config = buildPoolConfig('postgresql://classmeet:secret@dpg-abc123-a/classmeet');
  assert.equal(config.ssl, false);
});

test('a database on this machine connects without TLS', () => {
  assert.equal(buildPoolConfig('postgresql://postgres:postgres@localhost:5432/classmeet').ssl, false);
  assert.equal(buildPoolConfig('postgresql://postgres:postgres@127.0.0.1:5432/classmeet').ssl, false);
});
