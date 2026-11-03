import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express, { type NextFunction, type Request, type Response } from 'express';
import { errorHandler } from '../middleware/error-handler.js';
import type { SessionClaims } from '../session.js';
import type {
  Course,
  CourseSearchResult,
  DecisionOutcome,
  EnrolledCourse,
  GroupDetails,
  GroupRepository,
  GroupSummary,
  JoinRequestOutcome,
} from '../groups/repository.js';
import { createCoursesRouter } from './courses.js';
import { createGroupsRouter } from './groups.js';
import { createMeRouter } from './me.js';

const COURSE: Course = {
  id: '3f2b8c1e-5d4a-4c0e-9b7a-1a2b3c4d5e6f',
  code: 'CSE 3311',
  title: 'Object Oriented Software Engineering',
};
const GROUP_ID = '9a8b7c6d-1111-4222-8333-444455556666';
const REQUEST_ID = '7e7e7e7e-1111-4222-8333-444455556666';
const UNKNOWN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VIEWER_ID = '11111111-2222-4333-8444-555566667777';

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
  members: [{ userId: VIEWER_ID, name: 'Real Student', isLeader: true }],
  viewerRole: 'leader',
  viewerRequestStatus: null,
  pendingRequests: [],
};

/** In-memory stand-in for Postgres. Records calls and returns scripted outcomes. */
class FakeRepository implements GroupRepository {
  createdBy: string[] = [];
  enrolled: Array<{ viewerId: string; courseId: string }> = [];
  searches: Array<{ search: string; viewerId: string }> = [];
  viewersOfGroup: string[] = [];
  joinOutcome: JoinRequestOutcome = 'created';
  decisionOutcome: DecisionOutcome = 'decided';
  decisions: Array<{ requestId: string; decision: string; viewerId: string }> = [];

  async listCourses(search: string, viewerId: string): Promise<CourseSearchResult[]> {
    this.searches.push({ search, viewerId });
    return [{ ...COURSE, enrolled: false }];
  }
  async listMyCourses(): Promise<EnrolledCourse[]> {
    return [{ ...COURSE, groupCount: 2 }];
  }
  async enrollInCourse(viewerId: string, courseId: string): Promise<void> {
    this.enrolled.push({ viewerId, courseId });
  }
  async findCourse(courseId: string): Promise<Course | null> {
    return courseId === COURSE.id ? COURSE : null;
  }
  async listGroupsForCourse(): Promise<GroupSummary[]> {
    return [GROUP];
  }
  async createGroup(leaderId: string): Promise<string> {
    this.createdBy.push(leaderId);
    return GROUP_ID;
  }
  async findGroup(groupId: string, viewerId: string): Promise<GroupDetails | null> {
    this.viewersOfGroup.push(viewerId);
    return groupId === GROUP_ID ? GROUP : null;
  }
  async requestToJoin(): Promise<JoinRequestOutcome> {
    return this.joinOutcome;
  }
  async decideJoinRequest(
    _groupId: string,
    requestId: string,
    decision: 'approve' | 'decline',
    viewerId: string,
  ): Promise<DecisionOutcome> {
    this.decisions.push({ requestId, decision, viewerId });
    return this.decisionOutcome;
  }
}

const repository = new FakeRepository();
let session: SessionClaims = { userId: VIEWER_ID, providerObjectId: 'oid-1' };
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
  app.use('/api/me', createMeRouter(repository));
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

beforeEach(() => {
  repository.joinOutcome = 'created';
  repository.decisionOutcome = 'decided';
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

// ---- courses ----------------------------------------------------------

test('GET /api/courses passes the trimmed search and the viewer to the repository', async () => {
  const { status, json } = await send('GET', '/api/courses?q=%20cse%20');
  assert.equal(status, 200);
  assert.equal(json.courses[0].code, 'CSE 3311');
  assert.deepEqual(repository.searches.at(-1), { search: 'cse', viewerId: VIEWER_ID });
});

test('GET /api/courses rejects an over-long search', async () => {
  const { status, json } = await send('GET', `/api/courses?q=${'a'.repeat(101)}`);
  assert.equal(status, 400);
  assert.equal(json.error.code, 'invalid_search');
});

test('GET /api/courses/:id/groups returns the course and its groups', async () => {
  const { status, json } = await send('GET', `/api/courses/${COURSE.id}/groups`);
  assert.equal(status, 200);
  assert.equal(json.course.code, 'CSE 3311');
  assert.equal(json.groups.length, 1);
});

test('GET /api/courses/:id/groups returns 404 for an unknown course', async () => {
  const { status, json } = await send('GET', `/api/courses/${UNKNOWN_ID}/groups`);
  assert.equal(status, 404);
  assert.equal(json.error.code, 'course_not_found');
});

test('GET /api/courses/:id/groups rejects a malformed id', async () => {
  const { status, json } = await send('GET', '/api/courses/not-a-uuid/groups');
  assert.equal(status, 400);
  assert.equal(json.error.code, 'invalid_courseId');
});

// ---- my courses -------------------------------------------------------

test('GET /api/me/courses lists the student\'s courses with group counts', async () => {
  const { status, json } = await send('GET', '/api/me/courses');
  assert.equal(status, 200);
  assert.equal(json.courses[0].groupCount, 2);
});

test('POST /api/me/courses adds the course for the signed-in student', async () => {
  const { status } = await send('POST', '/api/me/courses', { courseId: COURSE.id });
  assert.equal(status, 200);
  assert.deepEqual(repository.enrolled.at(-1), { viewerId: VIEWER_ID, courseId: COURSE.id });
});

test('POST /api/me/courses returns 404 for an unknown course and 400 for a bad id', async () => {
  const before = repository.enrolled.length;
  assert.equal((await send('POST', '/api/me/courses', { courseId: UNKNOWN_ID })).status, 404);
  assert.equal((await send('POST', '/api/me/courses', { courseId: 'nope' })).status, 400);
  assert.equal(repository.enrolled.length, before);
});

// ---- groups -----------------------------------------------------------

test('POST /api/groups creates a group led by the signed-in user', async () => {
  const { status, json } = await send('POST', '/api/groups', validGroupBody);
  assert.equal(status, 201);
  assert.equal(json.group.id, GROUP_ID);
  assert.equal(repository.createdBy.at(-1), VIEWER_ID);
});

test('POST /api/groups rejects invalid input without touching the repository', async () => {
  const before = repository.createdBy.length;
  const { status, json } = await send('POST', '/api/groups', { ...validGroupBody, maxMembers: 1 });
  assert.equal(status, 400);
  assert.equal(json.error.code, 'invalid_maxMembers');
  assert.equal(repository.createdBy.length, before);
});

test('POST /api/groups returns 404 when the course does not exist', async () => {
  const { status, json } = await send('POST', '/api/groups', { ...validGroupBody, courseId: UNKNOWN_ID });
  assert.equal(status, 404);
  assert.equal(json.error.code, 'course_not_found');
});

test('GET /api/groups/:id returns the group for the viewer, with member names only', async () => {
  const { status, json } = await send('GET', `/api/groups/${GROUP_ID}`);
  assert.equal(status, 200);
  assert.equal(json.group.members[0].name, 'Real Student');
  assert.equal('email' in json.group.members[0], false);
  assert.equal(repository.viewersOfGroup.at(-1), VIEWER_ID);
});

test('GET /api/groups/:id returns 404 for an unknown group', async () => {
  const { status, json } = await send('GET', `/api/groups/${UNKNOWN_ID}`);
  assert.equal(status, 404);
  assert.equal(json.error.code, 'group_not_found');
});

// ---- join requests ----------------------------------------------------

test('POST /api/groups/:id/join-requests creates a pending request', async () => {
  const { status, json } = await send('POST', `/api/groups/${GROUP_ID}/join-requests`);
  assert.equal(status, 201);
  assert.equal(json.status, 'pending');
});

const joinFailures: Array<[JoinRequestOutcome, number, string]> = [
  ['group_not_found', 404, 'group_not_found'],
  ['already_member', 409, 'already_member'],
  ['already_requested', 409, 'already_requested'],
  ['group_full', 409, 'group_full'],
];
for (const [outcome, expectedStatus, expectedCode] of joinFailures) {
  test(`join request answers ${expectedStatus} ${expectedCode} when the outcome is ${outcome}`, async () => {
    repository.joinOutcome = outcome;
    const { status, json } = await send('POST', `/api/groups/${GROUP_ID}/join-requests`);
    assert.equal(status, expectedStatus);
    assert.equal(json.error.code, expectedCode);
  });
}

test('join request rejects a malformed group id', async () => {
  const { status } = await send('POST', '/api/groups/nope/join-requests');
  assert.equal(status, 400);
});

// ---- leader decisions -------------------------------------------------

const decisionPath = `/api/groups/${GROUP_ID}/join-requests/${REQUEST_ID}/decision`;

test('the leader can approve a request and gets the updated group back', async () => {
  const { status, json } = await send('POST', decisionPath, { decision: 'approve' });
  assert.equal(status, 200);
  assert.equal(json.group.id, GROUP_ID);
  assert.deepEqual(repository.decisions.at(-1), { requestId: REQUEST_ID, decision: 'approve', viewerId: VIEWER_ID });
});

test('the leader can decline a request', async () => {
  const { status } = await send('POST', decisionPath, { decision: 'decline' });
  assert.equal(status, 200);
  assert.equal(repository.decisions.at(-1)?.decision, 'decline');
});

test('a decision other than approve or decline is rejected before reaching the repository', async () => {
  const before = repository.decisions.length;
  const { status, json } = await send('POST', decisionPath, { decision: 'maybe' });
  assert.equal(status, 400);
  assert.equal(json.error.code, 'invalid_decision');
  assert.equal(repository.decisions.length, before);
});

const decisionFailures: Array<[DecisionOutcome, number, string]> = [
  ['group_not_found', 404, 'group_not_found'],
  ['not_leader', 403, 'not_leader'],
  ['request_not_found', 404, 'request_not_found'],
  ['group_full', 409, 'group_full'],
];
for (const [outcome, expectedStatus, expectedCode] of decisionFailures) {
  test(`decision answers ${expectedStatus} ${expectedCode} when the outcome is ${outcome}`, async () => {
    repository.decisionOutcome = outcome;
    const { status, json } = await send('POST', decisionPath, { decision: 'approve' });
    assert.equal(status, expectedStatus);
    assert.equal(json.error.code, expectedCode);
  });
}
