import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express, { type NextFunction, type Request, type Response } from 'express';
import { errorHandler } from '../middleware/error-handler.js';
import type { SessionClaims } from '../session.js';
import type {
  Course,
  GroupDetails,
  GroupRepository,
  GroupSummary,
} from '../groups/repository.js';
import { createCoursesRouter } from './courses.js';
import { createGroupsRouter } from './groups.js';

const COURSE: Course = {
  id: '3f2b8c1e-5d4a-4c0e-9b7a-1a2b3c4d5e6f',
  code: 'CSE 3311',
  title: 'Object Oriented Software Engineering',
};
const GROUP_ID = '9a8b7c6d-1111-4222-8333-444455556666';
const REAL_USER_ID = '11111111-2222-4333-8444-555566667777';

const GROUP: GroupDetails = {
  id: GROUP_ID,
  courseId: COURSE.id,
  courseCode: COURSE.code,
  courseTitle: COURSE.title,
  goal: 'Review design patterns',
  meetingDay: 'Tuesday',
  meetingTime: '14:30',
  format: 'in_person',
  location: 'Library',
  maxMembers: 6,
  memberCount: 1,
  members: [{ userId: REAL_USER_ID, name: 'Real Student', isLeader: true }],
};

/** In-memory stand-in for Postgres; records what the router asked it to do. */
function fakeRepository(): GroupRepository & { createdBy: string[]; lastSearch: string } {
  const fake = {
    createdBy: [] as string[],
    lastSearch: '',
    async listCourses(search: string): Promise<Course[]> {
      fake.lastSearch = search;
      return [COURSE];
    },
    async courseExists(courseId: string): Promise<boolean> {
      return courseId === COURSE.id;
    },
    async listGroupsForCourse(): Promise<GroupSummary[]> {
      return [GROUP];
    },
    async createGroup(leaderId: string): Promise<string> {
      fake.createdBy.push(leaderId);
      return GROUP_ID;
    },
    async findGroup(groupId: string): Promise<GroupDetails | null> {
      return groupId === GROUP_ID ? GROUP : null;
    },
  };
  return fake;
}

const repository = fakeRepository();
let session: SessionClaims = { userId: REAL_USER_ID, providerObjectId: 'oid-1' } as SessionClaims;
let server: Server;
let baseUrl: string;

before(async () => {
  const app = express();
  app.use(express.json());
  // Stands in for requireAuth, which app.ts mounts in front of these routers.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.session = session;
    next();
  });
  app.use('/api/courses', createCoursesRouter(repository));
  app.use('/api/groups', createGroupsRouter(repository));
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
  return { status: response.status, json: await response.json() };
}

const validGroupBody = {
  courseId: COURSE.id,
  goal: 'Review design patterns',
  meetingDay: 'Tuesday',
  meetingTime: '14:30',
  format: 'in_person',
  location: 'Library',
  maxMembers: 6,
};

test('GET /api/courses passes the trimmed search to the repository', async () => {
  const { status, json } = await send('GET', '/api/courses?q=%20cse%20');
  assert.equal(status, 200);
  assert.equal(json.courses[0].code, 'CSE 3311');
  assert.equal(repository.lastSearch, 'cse');
});

test('GET /api/courses rejects an over-long search', async () => {
  const { status, json } = await send('GET', `/api/courses?q=${'a'.repeat(101)}`);
  assert.equal(status, 400);
  assert.equal(json.error.code, 'invalid_search');
});

test('GET /api/courses/:id/groups lists groups for a known course', async () => {
  const { status, json } = await send('GET', `/api/courses/${COURSE.id}/groups`);
  assert.equal(status, 200);
  assert.equal(json.groups.length, 1);
});

test('GET /api/courses/:id/groups returns 404 for an unknown course', async () => {
  const { status, json } = await send('GET', '/api/courses/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/groups');
  assert.equal(status, 404);
  assert.equal(json.error.code, 'course_not_found');
});

test('GET /api/courses/:id/groups rejects a malformed id', async () => {
  const { status, json } = await send('GET', '/api/courses/not-a-uuid/groups');
  assert.equal(status, 400);
  assert.equal(json.error.code, 'invalid_courseId');
});

test('POST /api/groups creates a group led by the signed-in user', async () => {
  const { status, json } = await send('POST', '/api/groups', validGroupBody);
  assert.equal(status, 201);
  assert.equal(json.group.id, GROUP_ID);
  assert.deepEqual(repository.createdBy.at(-1), REAL_USER_ID);
});

test('POST /api/groups rejects invalid input without touching the repository', async () => {
  const before = repository.createdBy.length;
  const { status, json } = await send('POST', '/api/groups', { ...validGroupBody, maxMembers: 1 });
  assert.equal(status, 400);
  assert.equal(json.error.code, 'invalid_maxMembers');
  assert.equal(repository.createdBy.length, before);
});

test('POST /api/groups returns 404 when the course does not exist', async () => {
  const { status, json } = await send('POST', '/api/groups', {
    ...validGroupBody,
    courseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  });
  assert.equal(status, 404);
  assert.equal(json.error.code, 'course_not_found');
});

test('POST /api/groups refuses a development-bypass session', async () => {
  const original = session;
  session = { ...original, dev: true };
  try {
    const before = repository.createdBy.length;
    const { status, json } = await send('POST', '/api/groups', validGroupBody);
    assert.equal(status, 403);
    assert.equal(json.error.code, 'dev_session_cannot_create');
    assert.equal(repository.createdBy.length, before);
  } finally {
    session = original;
  }
});

test('GET /api/groups/:id returns the group with member names only', async () => {
  const { status, json } = await send('GET', `/api/groups/${GROUP_ID}`);
  assert.equal(status, 200);
  assert.equal(json.group.members[0].name, 'Real Student');
  assert.equal('email' in json.group.members[0], false);
});

test('GET /api/groups/:id returns 404 for an unknown group', async () => {
  const { status, json } = await send('GET', '/api/groups/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.equal(status, 404);
  assert.equal(json.error.code, 'group_not_found');
});
