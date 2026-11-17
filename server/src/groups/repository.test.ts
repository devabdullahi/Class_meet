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
import type { PGlite } from '@electric-sql/pglite';
import { createMigratedPglite, pgliteDatabase } from '../db/pglite-test-database.js';
import { createPostgresGroupRepository, type GroupRepository } from './repository.js';
import { createPostgresProfileRepository, type ProfileRepository } from '../profiles/repository.js';
import type { StudentProfile } from '../profiles/validation.js';
import type { CreateGroupInput } from './validation.js';

let pglite: PGlite;
let repository: GroupRepository;
let profiles: ProfileRepository;
let cse3311: string;
let cse4308: string;

async function sql<Row>(text: string, params: unknown[] = []): Promise<Row[]> {
  return (await pglite.query<Row>(text, params)).rows;
}

before(async () => {
  pglite = await createMigratedPglite();
  repository = createPostgresGroupRepository(pgliteDatabase(pglite));
  profiles = createPostgresProfileRepository(pgliteDatabase(pglite));
  const courses = await sql<{ id: string; code: string }>('SELECT id, code FROM courses');
  cse3311 = courses.find((course) => course.code === 'CSE 3311')!.id;
  cse4308 = courses.find((course) => course.code === 'CSE 4308')!.id;
});

after(async () => {
  await pglite.close();
});

beforeEach(async () => {
  // CASCADE also empties the tables of later features that refer to these
  // (reports, for one), which Postgres would otherwise refuse to truncate around.
  await pglite.exec(
    'TRUNCATE group_join_requests, group_members, study_groups, course_enrollments, student_profiles, users CASCADE',
  );
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
    chatLink: null,
    ...overrides,
  };
}

/** A student who has added the course and leads a new group in it. */
async function groupLedBy(leaderId: string, courseId: string, overrides: Partial<CreateGroupInput> = {}) {
  await repository.enrollInCourse(leaderId, courseId);
  const result = await repository.createGroup(leaderId, groupInput(courseId, overrides));
  assert.equal(result.outcome, 'created');
  return result.outcome === 'created' ? result.groupId : '';
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

  // A student who has only asked to join sees the group in My groups, still without the link.
  await repository.enrollInCourse(outsider, cse3311);
  assert.equal(await repository.requestToJoin(groupId, outsider), 'created');
  const { requested } = await repository.listMyGroups(outsider);
  assert.equal(requested[0]?.id, groupId);
  assert.equal(requested[0]?.location, null);
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
    {
      id: cse3311,
      code: 'CSE 3311',
      title: 'Object Oriented Software Engineering',
      groupCount: 2,
      openGroupCount: 1,
      joinedGroupCount: 1,
      classmateCount: 1,
    },
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

// ---- Classmates and course links ----------------------------------------------

test('classmates are the other students who have added the course, counted without the viewer', async () => {
  const viewer = await addStudent('Jo');
  const classmates = [await addStudent('Alex'), await addStudent('Sam')];
  for (const student of classmates) await repository.enrollInCourse(student, cse3311);
  await repository.enrollInCourse(await addStudent('Kim'), cse4308);

  // Before the viewer adds the course, and after: the count does not change.
  assert.equal(await repository.countClassmates(cse3311, viewer), 2);
  await repository.enrollInCourse(viewer, cse3311);
  assert.equal(await repository.countClassmates(cse3311, viewer), 2);
  assert.equal(await repository.countClassmates(cse3311, classmates[0]!), 2);
  assert.equal(await repository.countClassmates(cse4308, viewer), 1);
  assert.equal((await repository.listMyCourses(viewer))[0]?.classmateCount, 2);
});

test('the first student to add a course has no classmates in it', async () => {
  const viewer = await addStudent('Jo');
  await repository.enrollInCourse(viewer, cse3311);
  assert.equal(await repository.countClassmates(cse3311, viewer), 0);
  assert.equal((await repository.listMyCourses(viewer))[0]?.classmateCount, 0);
});

test('a course link finds its course by the code with its space as a hyphen, and nothing for a code not in the catalog', async () => {
  const course = { id: cse3311, code: 'CSE 3311', title: 'Object Oriented Software Engineering' };
  assert.deepEqual(await repository.findCourseByLinkCode('CSE-3311'), course);
  assert.equal(await repository.findCourseByLinkCode('CSE-3399'), null);
  // The repository compares in the form parseCourseLinkCode produces; a space is not that form.
  assert.equal(await repository.findCourseByLinkCode('CSE 3311'), null);
});

test('whether a student has added a course', async () => {
  const student = await addStudent('Jo');
  assert.equal(await repository.isEnrolled(student, cse3311), false);
  await repository.enrollInCourse(student, cse3311);
  assert.equal(await repository.isEnrolled(student, cse3311), true);
  assert.equal(await repository.isEnrolled(student, cse4308), false);
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

// ---- Only a course's students take part in its groups -------------------------

test('a student must have added the course to start a group in it', async () => {
  const student = await addStudent('Jo');
  assert.deepEqual(await repository.createGroup(student, groupInput(cse3311)), { outcome: 'not_enrolled' });
  assert.deepEqual(await repository.listGroupsForCourse(cse3311, student), []);
});

test('a student must have added the course to ask to join one of its groups', async () => {
  const leader = await addStudent('Alex');
  const student = await addStudent('Jo');
  const groupId = await groupLedBy(leader, cse3311);
  assert.equal(await repository.requestToJoin(groupId, student), 'not_enrolled');
  assert.equal(await repository.countPendingRequestsForLeader(leader), 0);
});

// ---- Deleting a group --------------------------------------------------------

test('a leader deletes their group, its members and requests go with it, and the course can then be removed', async () => {
  const leader = await addStudent('Alex');
  const member = await addStudent('Jo');
  const waiting = await addStudent('Sam');
  const groupId = await groupLedBy(leader, cse3311);
  await joinGroup(groupId, cse3311, leader, member);
  await repository.enrollInCourse(waiting, cse3311);
  await repository.requestToJoin(groupId, waiting);

  assert.equal(await repository.deleteGroup(groupId, member), 'not_leader');
  assert.equal(await repository.deleteGroup(groupId, leader), 'deleted');

  assert.equal(await repository.findGroup(groupId, leader), null);
  assert.deepEqual(await repository.listMyGroups(member), { leading: [], member: [], requested: [] });
  assert.deepEqual(await repository.listMyGroups(waiting), { leading: [], member: [], requested: [] });
  assert.equal(await repository.removeCourse(leader, cse3311), 'removed');
  assert.equal(await repository.deleteGroup(groupId, leader), 'group_not_found');
});

// ---- Student profiles --------------------------------------------------------

const JO_PROFILE: StudentProfile = {
  major: 'Computer Science',
  year: 'sophomore',
  meetingPreference: 'either',
  studyStyles: ['practice_problems', 'talking_it_through'],
};
const EMPTY_PROFILE: StudentProfile = { major: null, year: null, meetingPreference: null, studyStyles: [] };

/** Jo and Kim ask to join Alex's group; Jo has a profile, Kim has not. */
async function groupWithRequests() {
  const leader = await addStudent('Alex');
  const withProfile = await addStudent('Jo');
  const withoutProfile = await addStudent('Kim');
  const groupId = await groupLedBy(leader, cse3311);
  await profiles.saveProfile(withProfile, JO_PROFILE);
  for (const student of [withProfile, withoutProfile]) {
    await repository.enrollInCourse(student, cse3311);
    assert.equal(await repository.requestToJoin(groupId, student), 'created');
  }
  return { leader, withProfile, withoutProfile, groupId };
}

test('a student saves, changes and clears their own profile', async () => {
  const student = await addStudent('Jo');
  assert.equal(await profiles.findProfile(student), null);

  const saved = await profiles.saveProfile(student, { ...JO_PROFILE, studyStyles: ['exam_cramming'] });
  assert.deepEqual(saved, { ...JO_PROFILE, studyStyles: ['exam_cramming'] });
  assert.deepEqual(await profiles.findProfile(student), saved);

  const changed = await profiles.saveProfile(student, { ...EMPTY_PROFILE, major: 'Physics' });
  assert.deepEqual(changed, { ...EMPTY_PROFILE, major: 'Physics' });

  // Clearing every field is the same as never having added one.
  assert.equal(await profiles.saveProfile(student, EMPTY_PROFILE), null);
  assert.equal(await profiles.findProfile(student), null);
  assert.deepEqual(await sql('SELECT user_id FROM student_profiles'), []);
});

test('the leader sees each waiting student’s profile, or that they have none, and never their email', async () => {
  const { leader, withProfile, withoutProfile, groupId } = await groupWithRequests();
  const requests = (await repository.findGroup(groupId, leader))?.pendingRequests ?? [];

  assert.deepEqual(
    requests.map((request) => [request.userId, request.profile]),
    [
      [withProfile, JO_PROFILE],
      [withoutProfile, null],
    ],
  );
  for (const request of requests) {
    assert.deepEqual(Object.keys(request).sort(), ['id', 'name', 'profile', 'userId']);
  }
  assert.doesNotMatch(JSON.stringify(requests), /@mavs\.uta\.edu/);
});

test('no one but that leader sees a requester’s profile, anywhere groups are returned', async () => {
  const { leader, withProfile, withoutProfile, groupId } = await groupWithRequests();
  const member = await addStudent('Sam');
  await joinGroup(groupId, cse3311, leader, member);
  // Another leader in the same course, whose group Jo did not ask to join.
  const otherLeader = await addStudent('Lee');
  await groupLedBy(otherLeader, cse3311);

  for (const viewer of [member, withProfile, withoutProfile, otherLeader]) {
    const seen = JSON.stringify([
      await repository.findGroup(groupId, viewer),
      await repository.listGroupsForCourse(cse3311, viewer),
      await repository.listMyGroups(viewer),
    ]);
    assert.doesNotMatch(seen, /Computer Science/);
  }
  // The leader sees it on the group's own pending requests only, not in lists.
  const leaderLists = JSON.stringify([
    await repository.listGroupsForCourse(cse3311, leader),
    await repository.listMyGroups(leader),
  ]);
  assert.doesNotMatch(leaderLists, /Computer Science/);
});

test('once a request is answered, its profile is no longer shown to the leader', async () => {
  const { leader, withProfile, withoutProfile, groupId } = await groupWithRequests();
  await repository.decideJoinRequest(groupId, await requestIdOf(groupId, withProfile), 'approve', leader);
  await repository.decideJoinRequest(groupId, await requestIdOf(groupId, withoutProfile), 'decline', leader);

  const group = await repository.findGroup(groupId, leader);
  assert.deepEqual(group?.pendingRequests, []);
  assert.doesNotMatch(JSON.stringify(group), /Computer Science/);
});

// ---- Group chat link ---------------------------------------------------------

const CHAT_LINK = 'https://groupme.com/join_group/12345678/AbCdEf';

test('a group chat link reaches the leader and members, never an outsider or a student still asking', async () => {
  const leader = await addStudent('Alex');
  const member = await addStudent('Jo');
  const outsider = await addStudent('Sam');
  const requester = await addStudent('Kim');
  const declined = await addStudent('Lee');
  const groupId = await groupLedBy(leader, cse3311, { chatLink: CHAT_LINK });
  await joinGroup(groupId, cse3311, leader, member);
  for (const student of [outsider, requester, declined]) await repository.enrollInCourse(student, cse3311);
  await repository.requestToJoin(groupId, requester);
  await repository.requestToJoin(groupId, declined);
  await repository.decideJoinRequest(groupId, await requestIdOf(groupId, declined), 'decline', leader);

  // Group Details.
  for (const insider of [leader, member]) {
    assert.equal((await repository.findGroup(groupId, insider))?.chatLink, CHAT_LINK);
  }
  for (const stranger of [outsider, requester, declined]) {
    const group = await repository.findGroup(groupId, stranger);
    assert.equal(group?.chatLink, null);
    assert.equal(group?.hasChatLink, true);
  }

  // A course's group list.
  assert.equal((await repository.listGroupsForCourse(cse3311, member))[0]?.chatLink, CHAT_LINK);
  for (const stranger of [outsider, requester, declined]) {
    const [listed] = await repository.listGroupsForCourse(cse3311, stranger);
    assert.equal(listed?.chatLink, null);
    assert.equal(listed?.hasChatLink, true);
  }

  // My groups.
  assert.equal((await repository.listMyGroups(leader)).leading[0]?.chatLink, CHAT_LINK);
  assert.equal((await repository.listMyGroups(member)).member[0]?.chatLink, CHAT_LINK);
  for (const stranger of [requester, declined]) {
    const { requested } = await repository.listMyGroups(stranger);
    assert.equal(requested[0]?.id, groupId);
    assert.equal(requested[0]?.chatLink, null);
  }

  // Leaving the group takes the link away again.
  await repository.leaveGroup(groupId, member);
  assert.equal((await repository.findGroup(groupId, member))?.chatLink, null);
});

test('a leader adds, changes and removes the chat link by editing the group', async () => {
  const leader = await addStudent('Alex');
  const groupId = await groupLedBy(leader, cse3311);
  const before = await repository.findGroup(groupId, leader);
  assert.equal(before?.chatLink, null);
  assert.equal(before?.hasChatLink, false);

  const settings = groupInput(cse3311);
  assert.equal(await repository.updateGroup(groupId, leader, { ...settings, chatLink: CHAT_LINK }), 'updated');
  assert.equal((await repository.findGroup(groupId, leader))?.chatLink, CHAT_LINK);

  assert.equal(await repository.updateGroup(groupId, leader, { ...settings, chatLink: null }), 'updated');
  const after = await repository.findGroup(groupId, leader);
  assert.equal(after?.chatLink, null);
  assert.equal(after?.hasChatLink, false);
});

test('the database itself refuses a plain-http chat link', async () => {
  const groupId = await groupLedBy(await addStudent('Alex'), cse3311);
  await assert.rejects(sql('UPDATE study_groups SET chat_link = $2 WHERE id = $1', [groupId, 'http://discord.gg/abc']));
});
