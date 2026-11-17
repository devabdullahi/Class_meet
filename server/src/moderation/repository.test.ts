/**
 * The moderation SQL against a real Postgres (PGlite, in this process) with
 * the project's migrations applied: the one-open-report rule, the queue's
 * order, and what removing a group or a member actually does to the data.
 */
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import type { QueryResultRow } from 'pg';
import type { Database, QueryRunner } from '../db/pool.js';
import { createPostgresGroupRepository, type GroupRepository } from '../groups/repository.js';
import { createPostgresModerationRepository, type ModerationRepository } from './repository.js';
import type { ReportInput } from './validation.js';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');

let pglite: PGlite;
let groups: GroupRepository;
let moderation: ModerationRepository;
let cse3311: string;

function runnerFor(executor: PGlite | Transaction): QueryRunner {
  return async <Row extends QueryResultRow>(sql: string, params: readonly unknown[] = []) =>
    (await executor.query<Row>(sql, [...params])).rows;
}

function pgliteDatabase(database: PGlite): Database {
  return {
    query: runnerFor(database),
    transaction: (work) => database.transaction((tx) => work(runnerFor(tx))),
  };
}

async function sql<Row>(text: string, params: unknown[] = []): Promise<Row[]> {
  return (await pglite.query<Row>(text, params)).rows;
}

before(async () => {
  pglite = await PGlite.create();
  const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith('.sql')).sort();
  for (const file of files) {
    await pglite.exec(await readFile(path.join(MIGRATIONS_DIR, file), 'utf8'));
  }
  const database = pgliteDatabase(pglite);
  groups = createPostgresGroupRepository(database);
  moderation = createPostgresModerationRepository(database);
  const [course] = await sql<{ id: string }>(`SELECT id FROM courses WHERE code = 'CSE 3311'`);
  cse3311 = course!.id;
});

after(async () => {
  await pglite.close();
});

beforeEach(async () => {
  // CASCADE also empties the tables of other features that refer to these
  // (student profiles, for one), which Postgres would otherwise refuse to truncate around.
  await pglite.exec(
    'TRUNCATE reports, removed_groups, group_join_requests, group_members, study_groups, course_enrollments, users CASCADE',
  );
});

let studentCount = 0;
async function addStudent(name: string, { moderator = false } = {}): Promise<string> {
  studentCount += 1;
  const [row] = await sql<{ id: string }>(
    `INSERT INTO users (provider_tenant_id, provider_object_id, email, name, is_moderator)
     VALUES ('test-tenant', $1, $2, $3, $4) RETURNING id`,
    [`oid-${studentCount}`, `student${studentCount}@mavs.uta.edu`, name, moderator],
  );
  return row!.id;
}

async function groupLedBy(leaderId: string, name = 'Midterm 2 answer key'): Promise<string> {
  await groups.enrollInCourse(leaderId, cse3311);
  const result = await groups.createGroup(leaderId, {
    courseId: cse3311,
    name,
    goal: 'Last semester’s answers, $20',
    meetingDay: 'Sunday',
    meetingTime: '20:00',
    format: 'online',
    location: 'https://example.com/meet',
    maxMembers: 10,
    chatLink: null,
  });
  assert.equal(result.outcome, 'created');
  return result.outcome === 'created' ? result.groupId : '';
}

async function addMember(groupId: string, leaderId: string, studentId: string): Promise<void> {
  await groups.enrollInCourse(studentId, cse3311);
  assert.equal(await groups.requestToJoin(groupId, studentId), 'created');
  const [request] = await sql<{ id: string }>(
    'SELECT id FROM group_join_requests WHERE group_id = $1 AND user_id = $2',
    [groupId, studentId],
  );
  assert.equal(await groups.decideJoinRequest(groupId, request!.id, 'approve', leaderId), 'decided');
}

function groupReport(overrides: Partial<ReportInput> = {}): ReportInput {
  return { memberId: null, reason: 'exam_answers', details: 'Sells the answer key.', ...overrides };
}

// ---- Reporting -----------------------------------------------------------

test('a student can report a group they are not in, and sees only their own open report', async () => {
  const leader = await addStudent('Kevin Tran');
  const reporter = await addStudent('Sara Ahmed');
  const other = await addStudent('Maya Okafor');
  const groupId = await groupLedBy(leader);

  const result = await moderation.createReport(reporter, groupId, groupReport());
  assert.equal(result.outcome, 'created');
  await moderation.createReport(other, groupId, groupReport({ reason: 'spam' }));

  const mine = await moderation.listMyOpenReports(reporter, groupId);
  assert.equal(mine.length, 1);
  assert.equal(mine[0]?.memberId, null);
});

test('a second open report of the same target by the same student is refused', async () => {
  const leader = await addStudent('Kevin Tran');
  const reporter = await addStudent('Sara Ahmed');
  const groupId = await groupLedBy(leader);

  assert.equal((await moderation.createReport(reporter, groupId, groupReport())).outcome, 'created');
  const again = await moderation.createReport(reporter, groupId, groupReport({ reason: 'spam' }));
  assert.equal(again.outcome, 'already_reported');
  const [count] = await sql<{ n: number }>('SELECT count(*)::int AS n FROM reports');
  assert.equal(count?.n, 1);
});

test('the same student may report the group and one of its members separately', async () => {
  const leader = await addStudent('Kevin Tran');
  const member = await addStudent('Tyler Brooks');
  const reporter = await addStudent('Sara Ahmed');
  const groupId = await groupLedBy(leader);
  await addMember(groupId, leader, member);

  assert.equal((await moderation.createReport(reporter, groupId, groupReport())).outcome, 'created');
  const memberReport = await moderation.createReport(
    reporter,
    groupId,
    groupReport({ memberId: member, reason: 'harassment' }),
  );
  assert.equal(memberReport.outcome, 'created');
  assert.equal(memberReport.outcome === 'created' ? memberReport.report.memberName : null, 'Tyler Brooks');
});

test('after a report is resolved the student may report the target again', async () => {
  const leader = await addStudent('Kevin Tran');
  const reporter = await addStudent('Sara Ahmed');
  const moderator = await addStudent('Sam Lee', { moderator: true });
  const groupId = await groupLedBy(leader);

  await moderation.createReport(reporter, groupId, groupReport());
  assert.equal(await moderation.keepTarget({ groupId, memberId: null }, moderator), 'kept');
  assert.equal((await moderation.createReport(reporter, groupId, groupReport())).outcome, 'created');
});

test('reports about a missing group, a non-member, yourself or your own group are refused', async () => {
  const leader = await addStudent('Kevin Tran');
  const outsider = await addStudent('Not In It');
  const reporter = await addStudent('Sara Ahmed');
  const groupId = await groupLedBy(leader);

  const missing = await moderation.createReport(reporter, '00000000-0000-4000-8000-000000000001', groupReport());
  assert.equal(missing.outcome, 'group_not_found');
  assert.equal(
    (await moderation.createReport(reporter, groupId, groupReport({ memberId: outsider }))).outcome,
    'member_not_found',
  );
  assert.equal(
    (await moderation.createReport(leader, groupId, groupReport({ memberId: leader }))).outcome,
    'reporting_self',
  );
  assert.equal((await moderation.createReport(leader, groupId, groupReport())).outcome, 'own_group');
});

test('a leader can report a member but never sees reports about their own group', async () => {
  const leader = await addStudent('Kevin Tran');
  const member = await addStudent('Tyler Brooks');
  const reporter = await addStudent('Sara Ahmed');
  const groupId = await groupLedBy(leader);
  await addMember(groupId, leader, member);

  await moderation.createReport(reporter, groupId, groupReport());
  assert.deepEqual(await moderation.listMyOpenReports(leader, groupId), []);
  const reported = await moderation.createReport(leader, groupId, groupReport({ memberId: member, reason: 'harassment' }));
  assert.equal(reported.outcome, 'created');
  assert.equal((await moderation.listMyOpenReports(leader, groupId)).length, 1);
});

// ---- The queue -------------------------------------------------------------

test('the queue lists one row per target, most reported first, with the latest report', async () => {
  const leader = await addStudent('Kevin Tran');
  const member = await addStudent('Tyler Brooks');
  const maya = await addStudent('Maya Okafor');
  const hannah = await addStudent('Hannah Kim');
  const sara = await addStudent('Sara Ahmed');
  const groupId = await groupLedBy(leader);
  await addMember(groupId, leader, member);

  await moderation.createReport(sara, groupId, groupReport({ memberId: member, reason: 'harassment' }));
  await moderation.createReport(hannah, groupId, groupReport({ reason: 'spam', details: null }));
  await moderation.createReport(maya, groupId, groupReport({ details: 'The goal offers Midterm 2 for $20.' }));
  // created_at is now() per transaction; make the order unambiguous.
  await sql(`UPDATE reports SET created_at = created_at - interval '1 hour' WHERE reporter_id = $1`, [hannah]);

  const queue = await moderation.listOpenTargets();
  assert.equal(queue.length, 2);
  assert.equal(await moderation.countOpenTargets(), 2);

  const [groupRow, memberRow] = queue;
  assert.equal(groupRow?.member, null);
  assert.equal(groupRow?.reportCount, 2);
  assert.equal(groupRow?.groupTitle, 'Midterm 2 answer key');
  assert.equal(groupRow?.leaderName, 'Kevin Tran');
  assert.equal(groupRow?.memberCount, 2);
  assert.equal(groupRow?.latestReport.reporterName, 'Maya Okafor');
  assert.equal(groupRow?.latestReport.details, 'The goal offers Midterm 2 for $20.');

  assert.equal(memberRow?.reportCount, 1);
  assert.deepEqual(memberRow?.member, { userId: member, name: 'Tyler Brooks', isLeader: false, inGroup: true });
});

test('reports about a group its leader deleted leave the queue and the count', async () => {
  const leader = await addStudent('Kevin Tran');
  const reporter = await addStudent('Sara Ahmed');
  const groupId = await groupLedBy(leader);
  await moderation.createReport(reporter, groupId, groupReport());

  assert.equal(await groups.deleteGroup(groupId, leader), 'deleted');
  assert.deepEqual(await moderation.listOpenTargets(), []);
  assert.equal(await moderation.countOpenTargets(), 0);
});

// ---- Decisions -------------------------------------------------------------

test('keeping a target resolves only its reports and changes nothing else', async () => {
  const leader = await addStudent('Kevin Tran');
  const member = await addStudent('Tyler Brooks');
  const reporter = await addStudent('Sara Ahmed');
  const moderator = await addStudent('Sam Lee', { moderator: true });
  const groupId = await groupLedBy(leader);
  await addMember(groupId, leader, member);
  await moderation.createReport(reporter, groupId, groupReport({ reason: 'not_study_group' }));
  await moderation.createReport(reporter, groupId, groupReport({ memberId: member, reason: 'harassment' }));

  assert.equal(await moderation.keepTarget({ groupId, memberId: null }, moderator), 'kept');
  assert.equal(await moderation.keepTarget({ groupId, memberId: null }, moderator), 'no_open_reports');

  const queue = await moderation.listOpenTargets();
  assert.equal(queue.length, 1);
  assert.equal(queue[0]?.member?.userId, member);
  assert.notEqual(await groups.findGroup(groupId, leader), null);

  const [resolved] = await moderation.listResolvedTargets();
  assert.equal(resolved?.outcome, 'kept');
  assert.equal(resolved?.reason, 'not_study_group');
  assert.equal(resolved?.resolvedByName, 'Sam Lee');
  assert.equal(await moderation.countResolvedTargets(), 1);
});

test('removing a group deletes it with its members, leaves a record, and resolves every report about it', async () => {
  const leader = await addStudent('Kevin Tran');
  const member = await addStudent('Tyler Brooks');
  const maya = await addStudent('Maya Okafor');
  const sara = await addStudent('Sara Ahmed');
  const moderator = await addStudent('Sam Lee', { moderator: true });
  const groupId = await groupLedBy(leader);
  await addMember(groupId, leader, member);
  await moderation.createReport(maya, groupId, groupReport());
  await moderation.createReport(sara, groupId, groupReport());
  await moderation.createReport(sara, groupId, groupReport({ memberId: member, reason: 'harassment' }));

  assert.equal(await moderation.removeGroup(groupId, moderator), 'removed');

  assert.equal(await groups.findGroup(groupId, member), null);
  const [left] = await sql<{ members: number }>('SELECT count(*)::int AS members FROM group_members WHERE group_id = $1', [
    groupId,
  ]);
  assert.equal(left?.members, 0);
  assert.equal((await groups.listMyGroups(member)).member.length, 0);

  const removal = await moderation.findRemovedGroup(groupId);
  assert.equal(removal?.title, 'Midterm 2 answer key');
  assert.equal(removal?.courseCode, 'CSE 3311');
  assert.equal(removal?.courseId, cse3311);

  assert.deepEqual(await moderation.listOpenTargets(), []);
  assert.deepEqual(await moderation.listMyOpenReports(sara, groupId), []);
  const resolved = await moderation.listResolvedTargets();
  const groupDecision = resolved.find((row) => row.memberName === null);
  assert.equal(groupDecision?.outcome, 'removed');
  assert.equal(groupDecision?.reportCount, 2);
  // The group row is gone, so the title comes from the removal record.
  assert.equal(groupDecision?.groupTitle, 'Midterm 2 answer key');
  assert.equal(groupDecision?.courseCode, 'CSE 3311');
  assert.equal(resolved.find((row) => row.memberName === 'Tyler Brooks')?.outcome, 'removed');

  assert.equal(await moderation.removeGroup(groupId, moderator), 'group_not_found');
});

test('a group that was never removed has no removal record', async () => {
  const leader = await addStudent('Kevin Tran');
  const groupId = await groupLedBy(leader);
  assert.equal(await moderation.findRemovedGroup(groupId), null);
  assert.equal(await groups.deleteGroup(groupId, leader), 'deleted');
  assert.equal(await moderation.findRemovedGroup(groupId), null);
});

test('removing a member takes them out of the group and resolves only the reports about them', async () => {
  const leader = await addStudent('Kevin Tran');
  const member = await addStudent('Tyler Brooks');
  const reporter = await addStudent('Sara Ahmed');
  const moderator = await addStudent('Sam Lee', { moderator: true });
  const groupId = await groupLedBy(leader);
  await addMember(groupId, leader, member);
  await moderation.createReport(reporter, groupId, groupReport());
  await moderation.createReport(reporter, groupId, groupReport({ memberId: member, reason: 'harassment' }));

  assert.equal(await moderation.removeMember(groupId, member, moderator), 'removed');

  const group = await groups.findGroup(groupId, member);
  assert.equal(group?.viewerRole, 'none');
  assert.deepEqual(
    group?.members.map((m) => m.name),
    ['Kevin Tran'],
  );
  const queue = await moderation.listOpenTargets();
  assert.equal(queue.length, 1);
  assert.equal(queue[0]?.member, null);
  const [resolved] = await moderation.listResolvedTargets();
  assert.equal(resolved?.outcome, 'removed_from_group');
  assert.equal(resolved?.memberName, 'Tyler Brooks');

  assert.equal(await moderation.removeMember(groupId, member, moderator), 'not_member');
});

test('the leader cannot be removed from their own group', async () => {
  const leader = await addStudent('Kevin Tran');
  const moderator = await addStudent('Sam Lee', { moderator: true });
  const groupId = await groupLedBy(leader);
  assert.equal(await moderation.removeMember(groupId, leader, moderator), 'is_leader');
  assert.equal(await moderation.removeMember('00000000-0000-4000-8000-000000000001', leader, moderator), 'group_not_found');
});

test('only users flagged in the database are moderators', async () => {
  const student = await addStudent('Sara Ahmed');
  const moderator = await addStudent('Sam Lee', { moderator: true });
  assert.equal(await moderation.isModerator(student), false);
  assert.equal(await moderation.isModerator(moderator), true);
  assert.equal(await moderation.isModerator('00000000-0000-4000-8000-000000000001'), false);
});

test('the database refuses details over the limit and reasons outside the list', async () => {
  const leader = await addStudent('Kevin Tran');
  const reporter = await addStudent('Sara Ahmed');
  const groupId = await groupLedBy(leader);
  await assert.rejects(
    sql(`INSERT INTO reports (reporter_id, group_id, reason) VALUES ($1, $2, 'rude')`, [reporter, groupId]),
  );
  await assert.rejects(
    sql(`INSERT INTO reports (reporter_id, group_id, reason, details) VALUES ($1, $2, 'spam', $3)`, [
      reporter,
      groupId,
      'x'.repeat(501),
    ]),
  );
});
