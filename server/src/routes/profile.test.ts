import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express, { type NextFunction, type Request, type Response } from 'express';
import { errorHandler, notFoundHandler } from '../middleware/error-handler.js';
import type { SessionClaims } from '../session.js';
import type { ProfileRepository } from '../profiles/repository.js';
import { isEmptyProfile, type StudentProfile } from '../profiles/validation.js';
import { createProfileRouter } from './profile.js';

const JO = '11111111-2222-4333-8444-555566667777';
const SAM = '22222222-3333-4444-8555-666677778888';

/** Profiles kept per student, the way the real repository keys them. */
class FakeProfileRepository implements ProfileRepository {
  readonly byStudent = new Map<string, StudentProfile>();

  async findProfile(userId: string): Promise<StudentProfile | null> {
    return this.byStudent.get(userId) ?? null;
  }
  async saveProfile(userId: string, profile: StudentProfile): Promise<StudentProfile | null> {
    if (isEmptyProfile(profile)) {
      this.byStudent.delete(userId);
      return null;
    }
    this.byStudent.set(userId, profile);
    return profile;
  }
}

const repository = new FakeProfileRepository();
let session: SessionClaims = { userId: JO, providerObjectId: 'oid-jo' };
let server: Server;
let baseUrl: string;

function signInAs(userId: string): void {
  session = { userId, providerObjectId: `oid-${userId}` };
}

before(async () => {
  const app = express();
  app.use(express.json());
  // Stands in for requireAuth, which app.ts mounts in front of this router.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.session = session;
    next();
  });
  app.use('/api/me/profile', createProfileRouter(repository));
  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
});

async function send(method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, json: text === '' ? null : JSON.parse(text) };
}

const JO_PROFILE = {
  major: 'Computer Science',
  year: 'junior',
  meetingPreference: 'on_campus',
  studyStyles: ['practice_problems'],
};

test('a student saves their profile and reads it back', async () => {
  signInAs(JO);
  const saved = await send('PUT', '/api/me/profile', { ...JO_PROFILE, major: ' Computer Science ' });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.json, { profile: JO_PROFILE });

  const read = await send('GET', '/api/me/profile');
  assert.deepEqual(read.json, { profile: JO_PROFILE });
});

test('each student reads only their own profile', async () => {
  signInAs(JO);
  await send('PUT', '/api/me/profile', JO_PROFILE);
  signInAs(SAM);
  const { status, json } = await send('GET', '/api/me/profile');
  assert.equal(status, 200);
  assert.deepEqual(json, { profile: null });
});

test('there is no route to another student’s profile', async () => {
  signInAs(SAM);
  const { status } = await send('GET', `/api/me/profile/${JO}`);
  assert.equal(status, 404);
});

test('saving an empty profile removes it', async () => {
  signInAs(JO);
  await send('PUT', '/api/me/profile', JO_PROFILE);
  const { json } = await send('PUT', '/api/me/profile', { major: '', year: null, meetingPreference: null, studyStyles: [] });
  assert.deepEqual(json, { profile: null });
  assert.equal(repository.byStudent.has(JO), false);
});

test('an invalid profile is rejected and nothing is saved', async () => {
  signInAs(SAM);
  const { status, json } = await send('PUT', '/api/me/profile', {
    studyStyles: ['practice_problems', 'exam_cramming', 'teaching_each_other'],
  });
  assert.equal(status, 400);
  assert.equal(json.error.code, 'invalid_studyStyles');
  assert.equal(repository.byStudent.has(SAM), false);
});
