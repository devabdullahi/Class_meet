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
  LeaveGroupOutcome,
  RemoveCourseOutcome,
  UpdateGroupOutcome,
  WithdrawOutcome,
} from '../groups/repository.js';
import type { GroupSettings } from '../groups/validation.js';
import type { MyGroups } from '../groups/my-groups.js';
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
const OTHER_STUDENT_ID = '22222222-3333-4444-8555-666677778888';

const GROUP: GroupDetails = {
  id: GROUP_ID,
  courseId: COURSE.id,
  courseCode: COURSE.code,
  courseTitle: COURSE.title,
  name: 'Pattern crew',
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
  viewersOfCourseGroups: string[] = [];
  joinOutcome: JoinRequestOutcome = 'created';
  decisionOutcome: DecisionOutcome = 'decided';
  withdrawOutcome: WithdrawOutcome = 'withdrawn';
  updateOutcome: UpdateGroupOutcome = 'updated';
  updates: Array<{ groupId: string; viewerId: string; settings: GroupSettings }> = [];
  leaveOutcome: LeaveGroupOutcome = 'left';
  removeCourseOutcome: RemoveCourseOutcome = 'removed';
  removedCourses: Array<{ viewerId: string; courseId: string }> = [];
  departures: Array<{ groupId: string; viewerId: string }> = [];
  withdrawals: Array<{ groupId: string; viewerId: string }> = [];
  decisions: Array<{ requestId: string; decision: string; viewerId: string }> = [];
  myGroupsByViewer = new Map<string, MyGroups>();
  pendingRequestCountByViewer = new Map<string, number>();

  async listCourses(search: string, viewerId: string): Promise<CourseSearchResult[]> {
    this.searches.push({ search, viewerId });
    return [{ ...COURSE, enrolled: false }];
  }
  async listMyCourses(): Promise<EnrolledCourse[]> {
    return [{ ...COURSE, groupCount: 2, openGroupCount: 1, joinedGroupCount: 1 }];
  }
  async enrollInCourse(viewerId: string, courseId: string): Promise<void> {
    this.enrolled.push({ viewerId, courseId });
  }
  async removeCourse(viewerId: string, courseId: string): Promise<RemoveCourseOutcome> {
    this.removedCourses.push({ viewerId, courseId });
    return this.removeCourseOutcome;
  }
  async findCourse(courseId: string): Promise<Course | null> {
    return courseId === COURSE.id ? COURSE : null;
  }
  async listGroupsForCourse(_courseId: string, viewerId: string): Promise<GroupSummary[]> {
    this.viewersOfCourseGroups.push(viewerId);
    return [GROUP];
  }
  async listMyGroups(viewerId: string): Promise<MyGroups> {
    return this.myGroupsByViewer.get(viewerId) ?? { leading: [], member: [], requested: [] };
  }
  async countPendingRequestsForLeader(viewerId: string): Promise<number> {
    return this.pendingRequestCountByViewer.get(viewerId) ?? 0;
  }
  async createGroup(leaderId: string): Promise<string> {
    this.createdBy.push(leaderId);
    return GROUP_ID;
  }
  async findGroup(groupId: string, viewerId: string): Promise<GroupDetails | null> {
    this.viewersOfGroup.push(viewerId);
    return groupId === GROUP_ID ? GROUP : null;
  }
  async updateGroup(groupId: string, viewerId: string, settings: GroupSettings): Promise<UpdateGroupOutcome> {
    this.updates.push({ groupId, viewerId, settings });
    return this.updateOutcome;
  }
  async requestToJoin(): Promise<JoinRequestOutcome> {
    return this.joinOutcome;
  }
  async leaveGroup(groupId: string, viewerId: string): Promise<LeaveGroupOutcome> {
    this.departures.push({ groupId, viewerId });
    return this.leaveOutcome;
  }
  async withdrawJoinRequest(groupId: string, viewerId: string): Promise<WithdrawOutcome> {
    this.withdrawals.push({ groupId, viewerId });
    return this.withdrawOutcome;
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

/** Each test starts signed in as VIEWER_ID (see beforeEach). */
function signInAs(userId: string): void {
  session = { userId, providerObjectId: `oid-${userId}` };
}
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
  signInAs(VIEWER_ID);
  repository.joinOutcome = 'created';
  repository.decisionOutcome = 'decided';
  repository.withdrawOutcome = 'withdrawn';
  repository.updateOutcome = 'updated';
  repository.leaveOutcome = 'left';
  repository.removeCourseOutcome = 'removed';
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

const validGroupBody = {
  courseId: COURSE.id,
  name: 'Pattern crew',
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

test('GET /api/courses/:id/groups returns the course and its groups as the viewer sees them', async () => {
  const { status, json } = await send('GET', `/api/courses/${COURSE.id}/groups`);
  assert.equal(status, 200);
  assert.equal(json.course.code, 'CSE 3311');
  assert.equal(json.groups.length, 1);
  assert.equal(json.groups[0].viewerRole, 'leader');
  assert.equal(repository.viewersOfCourseGroups.at(-1), VIEWER_ID);
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
  assert.equal(json.courses[0].openGroupCount, 1);
  assert.equal(json.courses[0].joinedGroupCount, 1);
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

test('DELETE /api/me/courses/:id removes the course for the signed-in student', async () => {
  const { status } = await send('DELETE', `/api/me/courses/${COURSE.id}`);
  assert.equal(status, 204);
  assert.deepEqual(repository.removedCourses.at(-1), { viewerId: VIEWER_ID, courseId: COURSE.id });
});

const removeCourseFailures: Array<[RemoveCourseOutcome, number, string, string]> = [
  ['not_enrolled', 404, 'not_enrolled', 'CSE 3311 is not one of your courses.'],
  ['leads_group', 409, 'leads_group_in_course', 'You lead a study group in CSE 3311, so you cannot remove the course.'],
  [
    'in_group',
    409,
    'in_group_for_course',
    'You are in a study group for CSE 3311. Leave the group first, then remove the course.',
  ],
];
for (const [outcome, expectedStatus, expectedCode, expectedMessage] of removeCourseFailures) {
  test(`removing a course answers ${expectedStatus} ${expectedCode} when the outcome is ${outcome}`, async () => {
    repository.removeCourseOutcome = outcome;
    const { status, json } = await send('DELETE', `/api/me/courses/${COURSE.id}`);
    assert.equal(status, expectedStatus);
    assert.equal(json.error.code, expectedCode);
    assert.equal(json.error.message, expectedMessage);
  });
}

test('removing a course answers 404 for an unknown course and 400 for a bad id, without touching enrollments', async () => {
  const before = repository.removedCourses.length;
  const unknown = await send('DELETE', `/api/me/courses/${UNKNOWN_ID}`);
  assert.equal(unknown.status, 404);
  assert.equal(unknown.json.error.code, 'course_not_found');
  const malformed = await send('DELETE', '/api/me/courses/nope');
  assert.equal(malformed.status, 400);
  assert.equal(malformed.json.error.code, 'invalid_courseId');
  assert.equal(repository.removedCourses.length, before);
});

// ---- my groups --------------------------------------------------------

const LED_GROUP = { ...GROUP, pendingRequestCount: 2 };
const REQUESTED_GROUP = { ...GROUP, id: UNKNOWN_ID, viewerRole: 'none' as const, viewerRequestStatus: 'declined' as const };

test('GET /api/me/groups lists the groups the student leads, is in and asked to join', async () => {
  repository.myGroupsByViewer.set(VIEWER_ID, { leading: [LED_GROUP], member: [], requested: [REQUESTED_GROUP] });
  const { status, json } = await send('GET', '/api/me/groups');
  assert.equal(status, 200);
  assert.equal(json.leading[0].pendingRequestCount, 2);
  assert.deepEqual(json.member, []);
  assert.equal(json.requested[0].viewerRequestStatus, 'declined');
});

test('GET /api/me/groups answers with the groups of the signed-in student only', async () => {
  repository.myGroupsByViewer.set(VIEWER_ID, { leading: [LED_GROUP], member: [], requested: [] });
  repository.myGroupsByViewer.set(OTHER_STUDENT_ID, { leading: [], member: [GROUP], requested: [] });
  signInAs(OTHER_STUDENT_ID);
  const { json } = await send('GET', '/api/me/groups');
  assert.deepEqual(json.leading, []);
  assert.equal(json.member[0].id, GROUP_ID);
});

test('GET /api/me/groups/pending-request-count counts requests in groups the signed-in student leads', async () => {
  repository.pendingRequestCountByViewer.set(VIEWER_ID, 3);
  const mine = await send('GET', '/api/me/groups/pending-request-count');
  assert.equal(mine.status, 200);
  assert.deepEqual(mine.json, { pendingRequestCount: 3 });

  signInAs(OTHER_STUDENT_ID);
  const theirs = await send('GET', '/api/me/groups/pending-request-count');
  assert.deepEqual(theirs.json, { pendingRequestCount: 0 });
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

// ---- editing a group --------------------------------------------------

const { courseId: _courseId, ...validSettings } = validGroupBody;

test('PATCH /api/groups/:id passes the trimmed settings and the viewer, and returns the group', async () => {
  const { status, json } = await send('PATCH', `/api/groups/${GROUP_ID}`, { ...validSettings, name: '  New name ' });
  assert.equal(status, 200);
  assert.equal(json.group.id, GROUP_ID);
  const update = repository.updates.at(-1);
  assert.equal(update?.groupId, GROUP_ID);
  assert.equal(update?.viewerId, VIEWER_ID);
  assert.equal(update?.settings.name, 'New name');
  assert.equal('courseId' in (update?.settings ?? {}), false);
});

test('PATCH /api/groups/:id rejects invalid settings before reaching the repository', async () => {
  const before = repository.updates.length;
  const { status, json } = await send('PATCH', `/api/groups/${GROUP_ID}`, { ...validSettings, goal: '' });
  assert.equal(status, 400);
  assert.equal(json.error.code, 'invalid_goal');
  assert.equal(repository.updates.length, before);
});

const updateFailures: Array<[UpdateGroupOutcome, number, string]> = [
  ['group_not_found', 404, 'group_not_found'],
  ['not_leader', 403, 'not_leader'],
  ['size_below_member_count', 400, 'invalid_maxMembers'],
];
for (const [outcome, expectedStatus, expectedCode] of updateFailures) {
  test(`editing answers ${expectedStatus} ${expectedCode} when the outcome is ${outcome}`, async () => {
    repository.updateOutcome = outcome;
    const { status, json } = await send('PATCH', `/api/groups/${GROUP_ID}`, validSettings);
    assert.equal(status, expectedStatus);
    assert.equal(json.error.code, expectedCode);
  });
}

test('editing rejects a malformed group id', async () => {
  const { status, json } = await send('PATCH', '/api/groups/nope', validSettings);
  assert.equal(status, 400);
  assert.equal(json.error.code, 'invalid_groupId');
});

// ---- leaving a group --------------------------------------------------

test('DELETE /api/groups/:id/members/me lets the signed-in student leave', async () => {
  signInAs(OTHER_STUDENT_ID);
  const { status } = await send('DELETE', `/api/groups/${GROUP_ID}/members/me`);
  assert.equal(status, 204);
  assert.deepEqual(repository.departures.at(-1), { groupId: GROUP_ID, viewerId: OTHER_STUDENT_ID });
});

const leaveFailures: Array<[LeaveGroupOutcome, number, string]> = [
  ['group_not_found', 404, 'group_not_found'],
  ['is_leader', 409, 'leader_cannot_leave'],
  ['not_member', 404, 'not_member'],
];
for (const [outcome, expectedStatus, expectedCode] of leaveFailures) {
  test(`leaving answers ${expectedStatus} ${expectedCode} when the outcome is ${outcome}`, async () => {
    repository.leaveOutcome = outcome;
    const { status, json } = await send('DELETE', `/api/groups/${GROUP_ID}/members/me`);
    assert.equal(status, expectedStatus);
    assert.equal(json.error.code, expectedCode);
  });
}

test('the leader is told why they cannot leave', async () => {
  repository.leaveOutcome = 'is_leader';
  const { json } = await send('DELETE', `/api/groups/${GROUP_ID}/members/me`);
  assert.equal(json.error.message, 'You lead this group, so you cannot leave it.');
});

test('leaving rejects a malformed group id', async () => {
  const before = repository.departures.length;
  const { status } = await send('DELETE', '/api/groups/nope/members/me');
  assert.equal(status, 400);
  assert.equal(repository.departures.length, before);
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

test('a student can withdraw their own pending request', async () => {
  const { status } = await send('DELETE', `/api/groups/${GROUP_ID}/join-requests/mine`);
  assert.equal(status, 204);
  assert.deepEqual(repository.withdrawals.at(-1), { groupId: GROUP_ID, viewerId: VIEWER_ID });
});

test('withdrawing answers 404 when there is no pending request to withdraw', async () => {
  repository.withdrawOutcome = 'request_not_found';
  const { status, json } = await send('DELETE', `/api/groups/${GROUP_ID}/join-requests/mine`);
  assert.equal(status, 404);
  assert.equal(json.error.code, 'request_not_found');
});

test('withdrawing rejects a malformed group id', async () => {
  const before = repository.withdrawals.length;
  const { status } = await send('DELETE', '/api/groups/nope/join-requests/mine');
  assert.equal(status, 400);
  assert.equal(repository.withdrawals.length, before);
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
