/**
 * The report and moderation routes over an in-memory repository: who may
 * call what, what each outcome answers, and what reaches the repository.
 * The SQL behind them is tested in moderation/repository.test.ts.
 */
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express, { type NextFunction, type Request, type Response } from 'express';
import { errorHandler } from '../middleware/error-handler.js';
import type { SessionClaims } from '../session.js';
import type {
  CreateReportResult,
  KeepOutcome,
  ModerationRepository,
  MyOpenReport,
  OpenReportTarget,
  RemovedGroup,
  RemoveGroupOutcome,
  RemoveMemberOutcome,
  ReportTarget,
  ResolvedReportTarget,
} from '../moderation/repository.js';
import type { ReportInput } from '../moderation/validation.js';
import { createModerationRouter } from './moderation.js';
import { createReportsRouter } from './reports.js';

const GROUP_ID = '9a8b7c6d-1111-4222-8333-444455556666';
const MEMBER_ID = '22222222-3333-4444-8555-666677778888';
const STUDENT_ID = '11111111-2222-4333-8444-555566667777';
const MODERATOR_ID = '33333333-4444-4555-8666-777788889999';

const OPEN_TARGET: OpenReportTarget = {
  groupId: GROUP_ID,
  groupTitle: 'Midterm 2 answer key',
  courseId: '3f2b8c1e-5d4a-4c0e-9b7a-1a2b3c4d5e6f',
  courseCode: 'CSE 3311',
  leaderName: 'Kevin Tran',
  memberCount: 3,
  member: null,
  reportCount: 4,
  latestReport: {
    reason: 'exam_answers',
    details: 'The goal offers Midterm 2 for $20.',
    reporterName: 'Maya Okafor',
    reportedAt: '2026-11-15T10:00:00.000Z',
  },
};

class FakeModerationRepository implements ModerationRepository {
  moderators = new Set<string>([MODERATOR_ID]);
  createResult: CreateReportResult = {
    outcome: 'created',
    report: { memberId: null, memberName: null, reportedAt: '2026-11-14T10:00:00.000Z' },
  };
  keepOutcome: KeepOutcome = 'kept';
  removeGroupOutcome: RemoveGroupOutcome = 'removed';
  removeMemberOutcome: RemoveMemberOutcome = 'removed';
  removal: RemovedGroup | null = null;
  reportsCreated: Array<{ reporterId: string; groupId: string; input: ReportInput }> = [];
  myReportLookups: Array<{ reporterId: string; groupId: string }> = [];
  kept: Array<{ target: ReportTarget; moderatorId: string }> = [];
  groupRemovals: Array<{ groupId: string; moderatorId: string }> = [];
  memberRemovals: Array<{ groupId: string; memberId: string; moderatorId: string }> = [];

  async isModerator(userId: string): Promise<boolean> {
    return this.moderators.has(userId);
  }
  async createReport(reporterId: string, groupId: string, input: ReportInput): Promise<CreateReportResult> {
    this.reportsCreated.push({ reporterId, groupId, input });
    return this.createResult;
  }
  async listMyOpenReports(reporterId: string, groupId: string): Promise<MyOpenReport[]> {
    this.myReportLookups.push({ reporterId, groupId });
    return [];
  }
  async findRemovedGroup(): Promise<RemovedGroup | null> {
    return this.removal;
  }
  async countOpenTargets(): Promise<number> {
    return 3;
  }
  async listOpenTargets(): Promise<OpenReportTarget[]> {
    return [OPEN_TARGET];
  }
  async listResolvedTargets(): Promise<ResolvedReportTarget[]> {
    return [];
  }
  async countResolvedTargets(): Promise<number> {
    return 5;
  }
  async keepTarget(target: ReportTarget, moderatorId: string): Promise<KeepOutcome> {
    this.kept.push({ target, moderatorId });
    return this.keepOutcome;
  }
  async removeGroup(groupId: string, moderatorId: string): Promise<RemoveGroupOutcome> {
    this.groupRemovals.push({ groupId, moderatorId });
    return this.removeGroupOutcome;
  }
  async removeMember(groupId: string, memberId: string, moderatorId: string): Promise<RemoveMemberOutcome> {
    this.memberRemovals.push({ groupId, memberId, moderatorId });
    return this.removeMemberOutcome;
  }
}

let repository = new FakeModerationRepository();
let session: SessionClaims = { userId: STUDENT_ID, providerObjectId: 'oid-student' };
let server: Server;
let baseUrl: string;

function signInAs(userId: string): void {
  session = { userId, providerObjectId: `oid-${userId}` };
}

before(async () => {
  const app = express();
  app.use(express.json());
  // Stands in for requireAuth, which app.ts mounts in front of these routers.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.session = session;
    next();
  });
  // Each request reads the current fake, so beforeEach can replace it.
  app.use('/api/groups', (req, res, next) => createReportsRouter(repository)(req, res, next));
  app.use('/api/moderation', (req, res, next) => createModerationRouter(repository)(req, res, next));
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
  repository = new FakeModerationRepository();
  signInAs(STUDENT_ID);
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

// ---- Reporting ---------------------------------------------------------------

test('POST /api/groups/:id/reports files the report as the signed-in student', async () => {
  const { status, json } = await send('POST', `/api/groups/${GROUP_ID}/reports`, {
    memberId: MEMBER_ID,
    reason: 'harassment',
    details: '  Keeps posting insults.  ',
  });
  assert.equal(status, 201);
  assert.equal(json.report.reportedAt, '2026-11-14T10:00:00.000Z');
  assert.deepEqual(repository.reportsCreated, [
    {
      reporterId: STUDENT_ID,
      groupId: GROUP_ID,
      input: { memberId: MEMBER_ID, reason: 'harassment', details: 'Keeps posting insults.' },
    },
  ]);
});

test('POST /api/groups/:id/reports rejects a bad group id, reason, member id or over-long details', async () => {
  const cases: Array<[string, unknown, string]> = [
    ['not-a-uuid', { reason: 'spam' }, 'invalid_groupId'],
    [GROUP_ID, { reason: 'rude' }, 'invalid_reason'],
    [GROUP_ID, {}, 'invalid_reason'],
    [GROUP_ID, { reason: 'spam', memberId: 'someone' }, 'invalid_memberId'],
    [GROUP_ID, { reason: 'spam', details: 'x'.repeat(501) }, 'invalid_details'],
    [GROUP_ID, { reason: 'spam', details: 42 }, 'invalid_details'],
  ];
  for (const [groupId, body, code] of cases) {
    const { status, json } = await send('POST', `/api/groups/${groupId}/reports`, body);
    assert.equal(status, 400, code);
    assert.equal(json.error.code, code);
  }
  assert.equal(repository.reportsCreated.length, 0);
});

test('POST /api/groups/:id/reports answers each refusal with its own status', async () => {
  const cases: Array<[CreateReportResult, number, string]> = [
    [{ outcome: 'already_reported' }, 409, 'already_reported'],
    [{ outcome: 'group_not_found' }, 404, 'group_not_found'],
    [{ outcome: 'member_not_found' }, 404, 'member_not_found'],
    [{ outcome: 'reporting_self' }, 400, 'reporting_self'],
    [{ outcome: 'own_group' }, 400, 'own_group'],
  ];
  for (const [result, expectedStatus, code] of cases) {
    repository.createResult = result;
    const { status, json } = await send('POST', `/api/groups/${GROUP_ID}/reports`, { reason: 'spam' });
    assert.equal(status, expectedStatus, code);
    assert.equal(json.error.code, code);
  }
});

test('GET /api/groups/:id/reports/mine only ever looks up the signed-in student’s own reports', async () => {
  const { status, json } = await send('GET', `/api/groups/${GROUP_ID}/reports/mine`);
  assert.equal(status, 200);
  assert.deepEqual(json, { reports: [] });
  assert.deepEqual(repository.myReportLookups, [{ reporterId: STUDENT_ID, groupId: GROUP_ID }]);
});

test('GET /api/groups/:id/removal explains a removed group and is 404 otherwise', async () => {
  assert.equal((await send('GET', `/api/groups/${GROUP_ID}/removal`)).status, 404);
  repository.removal = {
    groupId: GROUP_ID,
    title: 'Midterm 2 answer key',
    courseId: OPEN_TARGET.courseId,
    courseCode: 'CSE 3311',
    removedAt: '2026-11-16T12:00:00.000Z',
  };
  const { status, json } = await send('GET', `/api/groups/${GROUP_ID}/removal`);
  assert.equal(status, 200);
  assert.equal(json.removal.title, 'Midterm 2 answer key');
  // Who removed it is for moderators only.
  assert.equal('removedBy' in json.removal, false);
});

// ---- Who may moderate ----------------------------------------------------------

test('GET /api/moderation/me tells a student they are not a moderator, without a count', async () => {
  const { status, json } = await send('GET', '/api/moderation/me');
  assert.equal(status, 200);
  assert.deepEqual(json, { isModerator: false, openCount: null });
});

test('GET /api/moderation/me gives a moderator the number of targets waiting', async () => {
  signInAs(MODERATOR_ID);
  const { json } = await send('GET', '/api/moderation/me');
  assert.deepEqual(json, { isModerator: true, openCount: 3 });
});

const MODERATOR_ENDPOINTS: Array<[string, string]> = [
  ['GET', '/api/moderation/reports'],
  ['POST', `/api/moderation/groups/${GROUP_ID}/keep`],
  ['POST', `/api/moderation/groups/${GROUP_ID}/members/${MEMBER_ID}/keep`],
  ['DELETE', `/api/moderation/groups/${GROUP_ID}`],
  ['DELETE', `/api/moderation/groups/${GROUP_ID}/members/${MEMBER_ID}`],
];

test('every moderation endpoint answers 403 to a student, including a group’s leader, and does nothing', async () => {
  for (const [method, path] of MODERATOR_ENDPOINTS) {
    const { status, json } = await send(method, path);
    assert.equal(status, 403, `${method} ${path}`);
    assert.equal(json.error.code, 'not_moderator');
  }
  assert.deepEqual(repository.kept, []);
  assert.deepEqual(repository.groupRemovals, []);
  assert.deepEqual(repository.memberRemovals, []);
});

test('revoking the flag takes effect on the next request', async () => {
  signInAs(MODERATOR_ID);
  assert.equal((await send('GET', '/api/moderation/reports')).status, 200);
  repository.moderators.clear();
  assert.equal((await send('GET', '/api/moderation/reports')).status, 403);
});

// ---- Moderator actions ----------------------------------------------------------

test('GET /api/moderation/reports returns the queue, recent decisions and their total', async () => {
  signInAs(MODERATOR_ID);
  const { status, json } = await send('GET', '/api/moderation/reports');
  assert.equal(status, 200);
  assert.deepEqual(json, { open: [OPEN_TARGET], resolved: [], resolvedCount: 5 });
});

test('keeping resolves the group or the member as the signed-in moderator', async () => {
  signInAs(MODERATOR_ID);
  assert.equal((await send('POST', `/api/moderation/groups/${GROUP_ID}/keep`)).status, 204);
  assert.equal((await send('POST', `/api/moderation/groups/${GROUP_ID}/members/${MEMBER_ID}/keep`)).status, 204);
  assert.deepEqual(repository.kept, [
    { target: { groupId: GROUP_ID, memberId: null }, moderatorId: MODERATOR_ID },
    { target: { groupId: GROUP_ID, memberId: MEMBER_ID }, moderatorId: MODERATOR_ID },
  ]);

  repository.keepOutcome = 'no_open_reports';
  const { status, json } = await send('POST', `/api/moderation/groups/${GROUP_ID}/keep`);
  assert.equal(status, 404);
  assert.equal(json.error.code, 'no_open_reports');
});

test('removing a group passes the moderator along and reports a group already gone', async () => {
  signInAs(MODERATOR_ID);
  assert.equal((await send('DELETE', `/api/moderation/groups/${GROUP_ID}`)).status, 204);
  assert.deepEqual(repository.groupRemovals, [{ groupId: GROUP_ID, moderatorId: MODERATOR_ID }]);

  repository.removeGroupOutcome = 'group_not_found';
  assert.equal((await send('DELETE', `/api/moderation/groups/${GROUP_ID}`)).status, 404);
});

test('removing a member answers each refusal with its own status', async () => {
  signInAs(MODERATOR_ID);
  assert.equal((await send('DELETE', `/api/moderation/groups/${GROUP_ID}/members/${MEMBER_ID}`)).status, 204);
  assert.deepEqual(repository.memberRemovals, [{ groupId: GROUP_ID, memberId: MEMBER_ID, moderatorId: MODERATOR_ID }]);

  const cases: Array<[RemoveMemberOutcome, number, string]> = [
    ['is_leader', 409, 'member_is_leader'],
    ['not_member', 404, 'not_member'],
    ['group_not_found', 404, 'group_not_found'],
  ];
  for (const [outcome, expectedStatus, code] of cases) {
    repository.removeMemberOutcome = outcome;
    const { status, json } = await send('DELETE', `/api/moderation/groups/${GROUP_ID}/members/${MEMBER_ID}`);
    assert.equal(status, expectedStatus, outcome);
    assert.equal(json.error.code, code);
  }
});

test('moderation endpoints reject malformed ids before touching the repository', async () => {
  signInAs(MODERATOR_ID);
  const { status, json } = await send('DELETE', '/api/moderation/groups/not-a-uuid/members/also-not');
  assert.equal(status, 400);
  assert.equal(json.error.code, 'invalid_groupId');
  assert.deepEqual(repository.memberRemovals, []);
});
