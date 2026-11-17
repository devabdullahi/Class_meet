/**
 * The repository's SQL, run against a real Postgres: PGlite, Postgres
 * compiled to WebAssembly and running in this process, with the project's
 * own migrations applied. The route tests use an in-memory fake, so this is
 * where the seat cap, the remove-course rule and the meeting-link privacy
 * are checked as the database actually enforces them.
 *
 * PGlite has a single connection, so these tests cannot interleave two
 * transactions; the locking that guards against concurrent requests is
 * explained where it is written (see removeCourse and decideJoinRequest).
 */
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import type { QueryResultRow } from 'pg';
import type { Database, QueryRunner } from '../db/pool.js';
import { createPostgresGroupRepository, type GroupRepository } from './repository.js';
import type { CreateGroupInput } from './validation.js';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');

let pglite: PGlite;
let repository: GroupRepository;
let cse3311: string;
let cse4308: string;

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
  repository = createPostgresGroupRepository(pgliteDatabase(pglite));
  const courses = await sql<{ id: string; code: string }>('SELECT id, code FROM courses');
  cse3311 = courses.find((course) => course.code === 'CSE 3311')!.id;
  cse4308 = courses.find((course) => course.code === 'CSE 4308')!.id;
});

after(async () => {
  await pglite.close();
});

beforeEach(async () => {
  await pglite.exec('TRUNCATE group_join_requests, group_members, study_groups, course_enrollments, users');
});

let studentCount = 0;
async function addStudent(name: string): Promise<string> {
  studentCount += 1;
  const [row] = await sql<{ id: string }>(
    `INSERT INTO users (provider_tenant_id, provider_object_id, email, name)
     VALUES ('test-tenant', $1, $2, $3) RETURNING id`,
    [`oid-${studentCount}`, `student${studentCount}@mavs.uta.edu`, name],
  );
  return row!.id;
}

function groupInput(courseId: string, overrides: Partial<CreateGroupInput> = {}): CreateGroupInput {
  return {
    courseId,
    name: 'Pattern crew',
    goal: 'Review design patterns',
    meetingDay: 'Tuesday',
    meetingTime: '14:30',
    format: 'in_person',
    location: 'Library 412',
    maxMembers: 4,
    ...overrides,
  };
}

/** A student who has added the course and leads a new group in it. */
async function groupLedBy(leaderId: string, courseId: string, overrides: Partial<CreateGroupInput> = {}) {
  await repository.enrollInCourse(leaderId, courseId);
  return repository.createGroup(leaderId, groupInput(courseId, overrides));
}

async function requestIdOf(groupId: string, studentId: string): Promise<string> {
  const [row] = await sql<{ id: string }>(
    'SELECT id FROM group_join_requests WHERE group_id = $1 AND user_id = $2',
    [groupId, studentId],
  );
  return row!.id;
}

/** Enrols the student, sends a request and has the leader approve it. */
async function joinGroup(groupId: string, courseId: string, leaderId: string, studentId: string) {
  await repository.enrollInCourse(studentId, courseId);
  assert.equal(await repository.requestToJoin(groupId, studentId), 'created');
  return repository.decideJoinRequest(groupId, await requestIdOf(groupId, studentId), 'approve', leaderId);
}

// ---- Joining a group ---------------------------------------------------------

test('the creator of a group is its leader and first member', async () => {
  const leader = await addStudent('Alex');
  const groupId = await groupLedBy(leader, cse3311);
  const group = await repository.findGroup(groupId, leader);
  assert.equal(group?.viewerRole, 'leader');
  assert.equal(group?.memberCount, 1);
  assert.deepEqual(group?.members, [{ userId: leader, name: 'Alex', isLeader: true }]);
});

test('approving fills seats up to the size, and the request that would overfill it stays pending', async () => {
  const leader = await addStudent('Alex');
  const groupId = await groupLedBy(leader, cse3311, { maxMembers: 2 });
  const first = await addStudent('Jo');
  const second = await addStudent('Sam');
  await repository.enrollInCourse(first, cse3311);
  await repository.enrollInCourse(second, cse3311);
  await repository.requestToJoin(groupId, first);
  await repository.requestToJoin(groupId, second);

  assert.equal(await repository.decideJoinRequest(groupId, await requestIdOf(groupId, first), 'approve', leader), 'decided');
  const secondRequest = await requestIdOf(groupId, second);
  assert.equal(await repository.decideJoinRequest(groupId, secondRequest, 'approve', leader), 'group_full');

  const group = await repository.findGroup(groupId, leader);
  assert.equal(group?.memberCount, 2);
  assert.deepEqual(group?.pendingRequests.map((request) => request.name), ['Sam']);
  const late = await addStudent('Kim');
  await repository.enrollInCourse(late, cse3311);
  assert.equal(await repository.requestToJoin(groupId, late), 'group_full');
});

test('only the leader answers requests, and an answered request cannot be answered again', async () => {
  const leader = await addStudent('Alex');
  const student = await addStudent('Jo');
  const groupId = await groupLedBy(leader, cse3311);
  await repository.enrollInCourse(student, cse3311);
  await repository.requestToJoin(groupId, student);
  const requestId = await requestIdOf(groupId, student);

  assert.equal(await repository.decideJoinRequest(groupId, requestId, 'approve', student), 'not_leader');
  assert.equal(await repository.decideJoinRequest(groupId, requestId, 'decline', leader), 'decided');
  assert.equal(await repository.decideJoinRequest(groupId, requestId, 'approve', leader), 'request_not_found');
});

test('a declined student may ask again, which reopens the same request', async () => {
  const leader = await addStudent('Alex');
  const student = await addStudent('Jo');
  const groupId = await groupLedBy(leader, cse3311);
  await repository.enrollInCourse(student, cse3311);
  await repository.requestToJoin(groupId, student);
  const requestId = await requestIdOf(groupId, student);
  await repository.decideJoinRequest(groupId, requestId, 'decline', leader);
  assert.equal((await repository.findGroup(groupId, student))?.viewerRequestStatus, 'declined');

  assert.equal(await repository.requestToJoin(groupId, student), 'created');
  assert.equal(await requestIdOf(groupId, student), requestId);
  assert.equal((await repository.findGroup(groupId, student))?.viewerRequestStatus, 'pending');
  assert.equal(await repository.requestToJoin(groupId, student), 'already_requested');
});

test('a member leaves and frees the seat; the leader cannot leave', async () => {
  const leader = await addStudent('Alex');
  const student = await addStudent('Jo');
  const groupId = await groupLedBy(leader, cse3311);
  await joinGroup(groupId, cse3311, leader, student);

  assert.equal(await repository.leaveGroup(groupId, leader), 'is_leader');
  assert.equal(await repository.leaveGroup(groupId, student), 'left');
  assert.equal(await repository.leaveGroup(groupId, student), 'not_member');
  const group = await repository.findGroup(groupId, student);
  assert.equal(group?.viewerRole, 'none');
  assert.equal(group?.memberCount, 1);
});

// ---- What a student may see --------------------------------------------------

test('an online group shares its meeting link with its members only', async () => {
  const leader = await addStudent('Alex');
  const member = await addStudent('Jo');
  const outsider = await addStudent('Sam');
  const link = 'https://zoom.us/j/1234567890';
  const groupId = await groupLedBy(leader, cse3311, { format: 'online', location: link });
  await joinGroup(groupId, cse3311, leader, member);

  assert.equal((await repository.findGroup(groupId, outsider))?.location, null);
  assert.equal((await repository.listGroupsForCourse(cse3311, outsider))[0]?.location, null);
  assert.equal((await repository.findGroup(groupId, member))?.location, link);
  assert.equal((await repository.findGroup(groupId, leader))?.location, link);
});

test('only the leader is shown who is waiting to join', async () => {
  const leader = await addStudent('Alex');
  const student = await addStudent('Jo');
  const groupId = await groupLedBy(leader, cse3311);
  await repository.enrollInCourse(student, cse3311);
  await repository.requestToJoin(groupId, student);

  assert.deepEqual((await repository.findGroup(groupId, leader))?.pendingRequests.map((r) => r.name), ['Jo']);
  assert.deepEqual((await repository.findGroup(groupId, student))?.pendingRequests, []);
});

test('a leader cannot shrink a group below the members already in it', async () => {
  const leader = await addStudent('Alex');
  const groupId = await groupLedBy(leader, cse3311, { maxMembers: 3 });
  await joinGroup(groupId, cse3311, leader, await addStudent('Jo'));
  await joinGroup(groupId, cse3311, leader, await addStudent('Sam'));
  const settings = { ...groupInput(cse3311), maxMembers: 2 };

  assert.equal(await repository.updateGroup(groupId, leader, settings), 'size_below_member_count');
  assert.equal(await repository.updateGroup(groupId, leader, { ...settings, maxMembers: 3, name: 'Renamed' }), 'updated');
  assert.equal((await repository.findGroup(groupId, leader))?.name, 'Renamed');
});

// ---- My courses and My groups ------------------------------------------------

test('My courses counts each course\'s groups, those with a seat left, and those the student is in', async () => {
  const leader = await addStudent('Alex');
  const student = await addStudent('Jo');
  const fullGroup = await groupLedBy(leader, cse3311, { maxMembers: 2 });
  await groupLedBy(leader, cse3311);
  await joinGroup(fullGroup, cse3311, leader, student);

  assert.deepEqual(await repository.listMyCourses(student), [
    { id: cse3311, code: 'CSE 3311', title: 'Object Oriented Software Engineering', groupCount: 2, openGroupCount: 1, joinedGroupCount: 1 },
  ]);
});

test('My groups sorts groups by the student\'s relationship, with request counts for the leader only', async () => {
  const student = await addStudent('Jo');
  const other = await addStudent('Alex');
  const waiting = await addStudent('Sam');
  const led = await groupLedBy(student, cse3311);
  await repository.enrollInCourse(waiting, cse3311);
  await repository.requestToJoin(led, waiting);
  const joined = await groupLedBy(other, cse4308);
  await joinGroup(joined, cse4308, other, student);
  const requested = await groupLedBy(other, cse3311, { name: 'Requested' });
  await repository.requestToJoin(requested, student);
  await groupLedBy(other, cse3311, { name: 'Unrelated' });

  const myGroups = await repository.listMyGroups(student);
  assert.deepEqual(myGroups.leading.map((group) => [group.id, group.pendingRequestCount]), [[led, 1]]);
  assert.deepEqual(myGroups.member.map((group) => [group.id, group.courseCode]), [[joined, 'CSE 4308']]);
  assert.deepEqual(myGroups.requested.map((group) => [group.id, group.viewerRequestStatus]), [[requested, 'pending']]);
  assert.equal(await repository.countPendingRequestsForLeader(student), 1);
  // Alex leads the group Jo asked to join.
  assert.equal(await repository.countPendingRequestsForLeader(other), 1);
});

test('course search matches a code typed without its space and marks courses already added', async () => {
  const student = await addStudent('Jo');
  await repository.enrollInCourse(student, cse3311);
  assert.deepEqual(await repository.listCourses('cse3311', student), [
    { id: cse3311, code: 'CSE 3311', title: 'Object Oriented Software Engineering', enrolled: true },
  ]);
  assert.deepEqual(await repository.listCourses('100%', student), []);
});

// ---- Removing a course -------------------------------------------------------

test('a course is kept while the student is in one of its groups, and removable once they leave', async () => {
  const leader = await addStudent('Alex');
  const student = await addStudent('Jo');
  const groupId = await groupLedBy(leader, cse3311);
  await joinGroup(groupId, cse3311, leader, student);

  assert.equal(await repository.removeCourse(student, cse3311), 'in_group');
  assert.equal((await repository.listMyCourses(student)).length, 1);

  await repository.leaveGroup(groupId, student);
  assert.equal(await repository.removeCourse(student, cse3311), 'removed');
  assert.deepEqual(await repository.listMyCourses(student), []);
});

test('a leader keeps the course of the group they lead', async () => {
  const leader = await addStudent('Alex');
  await groupLedBy(leader, cse3311);
  assert.equal(await repository.removeCourse(leader, cse3311), 'leads_group');
  assert.equal((await repository.listMyCourses(leader)).length, 1);
});

test('removing a course withdraws the student\'s requests to its groups, and only those', async () => {
  const leader = await addStudent('Alex');
  const student = await addStudent('Jo');
  const pendingIn3311 = await groupLedBy(leader, cse3311);
  const declinedIn3311 = await groupLedBy(leader, cse3311);
  const pendingIn4308 = await groupLedBy(leader, cse4308);
  await repository.enrollInCourse(student, cse3311);
  await repository.enrollInCourse(student, cse4308);
  await repository.requestToJoin(pendingIn3311, student);
  await repository.requestToJoin(declinedIn3311, student);
  await repository.requestToJoin(pendingIn4308, student);
  await repository.decideJoinRequest(declinedIn3311, await requestIdOf(declinedIn3311, student), 'decline', leader);

  assert.equal(await repository.removeCourse(student, cse3311), 'removed');

  const { requested } = await repository.listMyGroups(student);
  assert.deepEqual(requested.map((group) => group.id), [pendingIn4308]);
  assert.equal(await repository.countPendingRequestsForLeader(leader), 1);
});

test('removing a course the student does not have says so', async () => {
  assert.equal(await repository.removeCourse(await addStudent('Jo'), cse3311), 'not_enrolled');
});
