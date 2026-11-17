/**
 * All SQL for courses, enrollments, study groups and join requests. Routers
 * depend on the `GroupRepository` interface, not on Postgres, so they are
 * testable with an in-memory fake and the database stays behind one boundary.
 */
import { poolDatabase, type Database } from '../db/pool.js';
import {
  courseSearchPatterns,
  type CreateGroupInput,
  type GroupFormat,
  type GroupSettings,
  type JoinDecision,
  type MeetingDay,
} from './validation.js';
import { visibleLocation } from './visibility.js';
import { groupByRelationship, type MyGroups } from './my-groups.js';
import { toStudentProfile, type ProfileColumns } from '../profiles/repository.js';
import type { StudentProfile } from '../profiles/validation.js';

export interface Course {
  id: string;
  code: string;
  title: string;
}

export interface CourseSearchResult extends Course {
  /** Whether the viewing student has already added this course. */
  enrolled: boolean;
}

export interface EnrolledCourse extends Course {
  groupCount: number;
  /** Groups with a seat left. */
  openGroupCount: number;
  /** Groups the viewer leads or belongs to. */
  joinedGroupCount: number;
  /** See GroupRepository.countClassmates. */
  classmateCount: number;
}

export type ViewerRole = 'leader' | 'member' | 'none';

export interface GroupSummary {
  id: string;
  courseId: string;
  /** Null for groups created before groups had names; show the goal instead. */
  name: string | null;
  goal: string;
  meetingDay: MeetingDay;
  meetingTime: string;
  format: GroupFormat;
  /** A place, or a meeting link. Null when the viewer may not see it (see visibility.ts). */
  location: string | null;
  maxMembers: number;
  memberCount: number;
  /** The viewing student's relationship to the group. */
  viewerRole: ViewerRole;
  /** The viewer's own request, if any. Declined requests may be sent again. */
  viewerRequestStatus: 'pending' | 'declined' | null;
}

export interface GroupMember {
  userId: string;
  name: string;
  isLeader: boolean;
}

export interface PendingJoinRequest {
  id: string;
  userId: string;
  name: string;
  /** What the student chose to tell leaders about themselves; null when they have not added a profile. */
  profile: StudentProfile | null;
}

export interface GroupDetails extends GroupSummary {
  courseCode: string;
  courseTitle: string;
  members: GroupMember[];
  /** Only filled in for the group's leader. */
  pendingRequests: PendingJoinRequest[];
}

export type JoinRequestOutcome =
  | 'created'
  | 'group_not_found'
  | 'already_member'
  | 'already_requested'
  | 'not_enrolled'
  | 'group_full';

export type CreateGroupOutcome = { outcome: 'created'; groupId: string } | { outcome: 'not_enrolled' };

export type DecisionOutcome = 'decided' | 'group_not_found' | 'not_leader' | 'request_not_found' | 'group_full';

export type WithdrawOutcome = 'withdrawn' | 'request_not_found';

export type UpdateGroupOutcome = 'updated' | 'group_not_found' | 'not_leader' | 'size_below_member_count';

export type LeaveGroupOutcome = 'left' | 'group_not_found' | 'is_leader' | 'not_member';

export type RemoveCourseOutcome = 'removed' | 'not_enrolled' | 'leads_group' | 'in_group';

export type DeleteGroupOutcome = 'deleted' | 'group_not_found' | 'not_leader';

export interface GroupRepository {
  listCourses(search: string, viewerId: string): Promise<CourseSearchResult[]>;
  listMyCourses(viewerId: string): Promise<EnrolledCourse[]>;
  enrollInCourse(viewerId: string, courseId: string): Promise<void>;
  /**
   * Takes a course off the viewer's list. Refused while they lead or belong
   * to one of its groups; otherwise their requests to its groups go with it.
   */
  removeCourse(viewerId: string, courseId: string): Promise<RemoveCourseOutcome>;
  findCourse(courseId: string): Promise<Course | null>;
  /** The course a course link names; `code` comes from parseCourseLinkCode. */
  findCourseByLinkCode(code: string): Promise<Course | null>;
  isEnrolled(viewerId: string, courseId: string): Promise<boolean>;
  /**
   * How many students other than the viewer have added the course. A count
   * only: who they are is never shared, since adding a course is not joining
   * anything and nobody agreed to be listed.
   */
  countClassmates(courseId: string, viewerId: string): Promise<number>;
  listGroupsForCourse(courseId: string, viewerId: string): Promise<GroupSummary[]>;
  /** Groups the viewer leads, belongs to, or has a pending or declined request for. */
  listMyGroups(viewerId: string): Promise<MyGroups>;
  /** Pending join requests across every group the viewer leads. */
  countPendingRequestsForLeader(viewerId: string): Promise<number>;
  /** Only a student who has added the course may start a group in it. */
  createGroup(leaderId: string, input: CreateGroupInput): Promise<CreateGroupOutcome>;
  findGroup(groupId: string, viewerId: string): Promise<GroupDetails | null>;
  /** Leader only. The size may not drop below the members already in the group. */
  updateGroup(groupId: string, viewerId: string, settings: GroupSettings): Promise<UpdateGroupOutcome>;
  /** Leader only. Its memberships and join requests are deleted with it. */
  deleteGroup(groupId: string, viewerId: string): Promise<DeleteGroupOutcome>;
  /** Only a student who has added the group's course may ask to join it. */
  requestToJoin(groupId: string, viewerId: string): Promise<JoinRequestOutcome>;
  /** A member gives up their seat. The leader cannot leave the group they lead. */
  leaveGroup(groupId: string, viewerId: string): Promise<LeaveGroupOutcome>;
  /** Removes the viewer's own request while it is still pending. */
  withdrawJoinRequest(groupId: string, viewerId: string): Promise<WithdrawOutcome>;
  decideJoinRequest(
    groupId: string,
    requestId: string,
    decision: JoinDecision,
    viewerId: string,
  ): Promise<DecisionOutcome>;
}

interface GroupRow {
  id: string;
  course_id: string;
  name: string | null;
  goal: string;
  meeting_day: MeetingDay;
  meeting_time: string;
  format: GroupFormat;
  location: string;
  max_members: number;
  member_count: string;
  viewer_role: ViewerRole;
  viewer_request_status: 'pending' | 'declined' | null;
}

/** Selects a GroupRow from `study_groups g`. $2 must be the viewing student's id. */
const GROUP_SUMMARY_COLUMNS = `g.id, g.course_id, g.name, g.goal, g.meeting_day,
       to_char(g.meeting_time, 'HH24:MI') AS meeting_time,
       g.format, g.location, g.max_members,
       (SELECT count(*) FROM group_members m WHERE m.group_id = g.id) AS member_count,
       CASE
         WHEN g.leader_id = $2 THEN 'leader'
         WHEN EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.id AND m.user_id = $2) THEN 'member'
         ELSE 'none'
       END AS viewer_role,
       (SELECT r.status FROM group_join_requests r
         WHERE r.group_id = g.id AND r.user_id = $2 AND r.status IN ('pending', 'declined')
       ) AS viewer_request_status`;

const MAX_COURSE_SEARCH_RESULTS = 50;

/**
 * Every group the API returns (course lists, My groups, Group Details) is
 * built here, so the meeting-link rule in visibility.ts is applied in one
 * place and no route can forget it.
 */
function toGroupSummary(row: GroupRow): GroupSummary {
  return {
    id: row.id,
    courseId: row.course_id,
    name: row.name,
    goal: row.goal,
    meetingDay: row.meeting_day,
    meetingTime: row.meeting_time,
    format: row.format,
    location: visibleLocation(row.format, row.location, row.viewer_role),
    maxMembers: row.max_members,
    // count(*) comes back from pg as a string (bigint).
    memberCount: Number(row.member_count),
    viewerRole: row.viewer_role,
    viewerRequestStatus: row.viewer_request_status,
  };
}

/** The repository over a real Postgres (the pool in production, PGlite in the tests). */
export function createPostgresGroupRepository(db: Database): GroupRepository {
  const { query } = db;
  return {
    async listCourses(search, viewerId) {
      const { text, compact } = courseSearchPatterns(search);
      return query<CourseSearchResult>(
        `SELECT c.id, c.code, c.title,
                EXISTS (SELECT 1 FROM course_enrollments e
                         WHERE e.course_id = c.id AND e.user_id = $2) AS enrolled
           FROM courses c
          WHERE c.code ILIKE $1 OR c.title ILIKE $1 OR replace(c.code, ' ', '') ILIKE $3
          ORDER BY c.code
          LIMIT ${MAX_COURSE_SEARCH_RESULTS}`,
        [text, viewerId, compact],
      );
    },

    async listMyCourses(viewerId) {
      const rows = await query<
        Course & {
          group_count: string;
          open_group_count: string;
          joined_group_count: string;
          classmate_count: string;
        }
      >(
        `SELECT c.id, c.code, c.title,
                (SELECT count(*) FROM study_groups g WHERE g.course_id = c.id) AS group_count,
                (SELECT count(*) FROM study_groups g
                  WHERE g.course_id = c.id
                    AND (SELECT count(*) FROM group_members m WHERE m.group_id = g.id) < g.max_members
                ) AS open_group_count,
                (SELECT count(*) FROM study_groups g
                   JOIN group_members m ON m.group_id = g.id AND m.user_id = $1
                  WHERE g.course_id = c.id
                ) AS joined_group_count,
                (SELECT count(*) FROM course_enrollments other
                  WHERE other.course_id = c.id AND other.user_id <> $1
                ) AS classmate_count
           FROM course_enrollments e
           JOIN courses c ON c.id = e.course_id
          WHERE e.user_id = $1
          ORDER BY c.code`,
        [viewerId],
      );
      return rows.map((row) => ({
        id: row.id,
        code: row.code,
        title: row.title,
        groupCount: Number(row.group_count),
        openGroupCount: Number(row.open_group_count),
        joinedGroupCount: Number(row.joined_group_count),
        classmateCount: Number(row.classmate_count),
      }));
    },

    async enrollInCourse(viewerId, courseId) {
      await query(
        `INSERT INTO course_enrollments (user_id, course_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, course_id) DO NOTHING`,
        [viewerId, courseId],
      );
    },

    async removeCourse(viewerId, courseId) {
      // The rule: a student in one of the course's groups (leading it or not)
      // keeps the course until they leave; a leader cannot leave, so a leader
      // keeps it. That way My groups never lists a group whose course is
      // missing from My courses. Pending and declined requests to the course's
      // groups are withdrawn, so no leader is left answering a student who has
      // dropped the course.
      //
      // Why a transaction that locks first: the student can gain a group in
      // this course at the same moment, in two ways, and each is held off by
      // a lock taken here before anything is checked:
      //   - an approval locks its group row FOR UPDATE, so locking every group
      //     of the course FOR SHARE waits for an approval in flight;
      //   - creating a group, or sending a request, locks the student's
      //     enrolment FOR SHARE, so locking it FOR UPDATE waits for those.
      // The checks must be separate, later statements: under Postgres's
      // default READ COMMITTED isolation a statement reads a snapshot taken
      // when it starts, so a single statement that waited on the locks would
      // still see the groups and memberships from before the others committed.
      return db.transaction(async (query) => {
        await query('SELECT 1 FROM course_enrollments WHERE user_id = $1 AND course_id = $2 FOR UPDATE', [
          viewerId,
          courseId,
        ]);
        await query('SELECT id FROM study_groups WHERE course_id = $1 FOR SHARE', [courseId]);

        const blockers = await query<{ leads: boolean; member: boolean }>(
          `SELECT EXISTS (SELECT 1 FROM study_groups WHERE course_id = $2 AND leader_id = $1) AS leads,
                  EXISTS (SELECT 1 FROM group_members m JOIN study_groups g ON g.id = m.group_id
                           WHERE g.course_id = $2 AND m.user_id = $1) AS member`,
          [viewerId, courseId],
        );
        if (blockers[0]?.leads === true) return 'leads_group';
        if (blockers[0]?.member === true) return 'in_group';

        const removed = await query(
          'DELETE FROM course_enrollments WHERE user_id = $1 AND course_id = $2 RETURNING course_id',
          [viewerId, courseId],
        );
        if (removed.length === 0) return 'not_enrolled';

        await query(
          `DELETE FROM group_join_requests r
            USING study_groups g
            WHERE g.id = r.group_id AND g.course_id = $2
              AND r.user_id = $1 AND r.status IN ('pending', 'declined')`,
          [viewerId, courseId],
        );
        return 'removed';
      });
    },

    async findCourse(courseId) {
      const rows = await query<Course>('SELECT id, code, title FROM courses WHERE id = $1', [courseId]);
      return rows[0] ?? null;
    },

    async findCourseByLinkCode(code) {
      // Each catalog code converted the way a link spells it (parseCourseLinkCode):
      // each run of spaces as one hyphen, in upper case. Codes are UNIQUE and
      // written "SUBJECT NUMBER", so at most one course matches.
      const rows = await query<Course>(
        `SELECT id, code, title FROM courses
          WHERE upper(regexp_replace(code, '[[:space:]]+', '-', 'g')) = $1`,
        [code],
      );
      return rows[0] ?? null;
    },

    async isEnrolled(viewerId, courseId) {
      const rows = await query<{ enrolled: boolean }>(
        'SELECT EXISTS (SELECT 1 FROM course_enrollments WHERE user_id = $1 AND course_id = $2) AS enrolled',
        [viewerId, courseId],
      );
      return rows[0]?.enrolled === true;
    },

    async countClassmates(courseId, viewerId) {
      const rows = await query<{ count: string }>(
        'SELECT count(*) AS count FROM course_enrollments WHERE course_id = $1 AND user_id <> $2',
        [courseId, viewerId],
      );
      return Number(rows[0]?.count ?? 0);
    },

    async listGroupsForCourse(courseId, viewerId) {
      const rows = await query<GroupRow>(
        `SELECT ${GROUP_SUMMARY_COLUMNS}
           FROM study_groups g
          WHERE g.course_id = $1
          ORDER BY g.created_at DESC`,
        [courseId, viewerId],
      );
      return rows.map(toGroupSummary);
    },

    async listMyGroups(viewerId) {
      // GROUP_SUMMARY_COLUMNS reads the viewer from $2; $1 is the same id, for the WHERE clause.
      const rows = await query<
        GroupRow & { course_code: string; course_title: string; pending_request_count: string }
      >(
        `SELECT ${GROUP_SUMMARY_COLUMNS}, c.code AS course_code, c.title AS course_title,
                CASE WHEN g.leader_id = $1 THEN
                  (SELECT count(*) FROM group_join_requests r WHERE r.group_id = g.id AND r.status = 'pending')
                ELSE 0 END AS pending_request_count
           FROM study_groups g
           JOIN courses c ON c.id = g.course_id
          WHERE g.leader_id = $1
             OR EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.id AND m.user_id = $1)
             OR EXISTS (SELECT 1 FROM group_join_requests r
                         WHERE r.group_id = g.id AND r.user_id = $1 AND r.status IN ('pending', 'declined'))
          ORDER BY c.code, g.created_at DESC`,
        [viewerId, viewerId],
      );
      return groupByRelationship(
        rows.map((row) => ({
          ...toGroupSummary(row),
          courseCode: row.course_code,
          courseTitle: row.course_title,
          pendingRequestCount: Number(row.pending_request_count),
        })),
      );
    },

    async countPendingRequestsForLeader(viewerId) {
      const rows = await query<{ count: string }>(
        `SELECT count(*) AS count
           FROM group_join_requests r
           JOIN study_groups g ON g.id = r.group_id
          WHERE g.leader_id = $1 AND r.status = 'pending'`,
        [viewerId],
      );
      return Number(rows[0]?.count ?? 0);
    },

    async createGroup(leaderId, input) {
      // One statement, so the group and its leader's membership are created
      // together or not at all. The group is only inserted for a student who
      // has the course; their enrolment row is locked (FOR SHARE) so a
      // removal of the course running at the same moment waits for this, then
      // sees the group and refuses (see removeCourse).
      const rows = await query<{ id: string }>(
        `WITH enrollment AS (
           SELECT user_id FROM course_enrollments
            WHERE course_id = $1 AND user_id = $2
              FOR SHARE
         ), new_group AS (
           INSERT INTO study_groups
             (course_id, leader_id, name, goal, meeting_day, meeting_time, format, location, max_members)
           SELECT $1::uuid, $2::uuid, $3::text, $4::text, $5::text, $6::time, $7::text, $8::text, $9::integer
             FROM enrollment
           RETURNING id, leader_id
         ), leader_membership AS (
           INSERT INTO group_members (group_id, user_id)
           SELECT id, leader_id FROM new_group
         )
         SELECT id FROM new_group`,
        [
          input.courseId,
          leaderId,
          input.name,
          input.goal,
          input.meetingDay,
          input.meetingTime,
          input.format,
          input.location,
          input.maxMembers,
        ],
      );
      const row = rows[0];
      return row === undefined ? { outcome: 'not_enrolled' } : { outcome: 'created', groupId: row.id };
    },

    async findGroup(groupId, viewerId) {
      const groups = await query<GroupRow & { course_code: string; course_title: string }>(
        `SELECT ${GROUP_SUMMARY_COLUMNS}, c.code AS course_code, c.title AS course_title
           FROM study_groups g
           JOIN courses c ON c.id = g.course_id
          WHERE g.id = $1`,
        [groupId, viewerId],
      );
      const group = groups[0];
      if (group === undefined) return null;

      const members = await query<{ user_id: string; name: string; is_leader: boolean }>(
        `SELECT m.user_id, u.name, (m.user_id = g.leader_id) AS is_leader
           FROM group_members m
           JOIN study_groups g ON g.id = m.group_id
           JOIN users u ON u.id = m.user_id
          WHERE m.group_id = $1
          ORDER BY is_leader DESC, m.joined_at`,
        [groupId],
      );

      // Who is waiting, with their profiles, goes to the leader alone: a
      // student's profile is shown only to the leader of a group they have a
      // pending request for, and never with their email.
      const pending = group.viewer_role === 'leader'
        ? await query<{ id: string; user_id: string; name: string; has_profile: boolean } & ProfileColumns>(
            `SELECT r.id, r.user_id, u.name,
                    p.user_id IS NOT NULL AS has_profile,
                    p.major, p.year, p.meeting_preference, p.study_styles
               FROM group_join_requests r
               JOIN users u ON u.id = r.user_id
               LEFT JOIN student_profiles p ON p.user_id = r.user_id
              WHERE r.group_id = $1 AND r.status = 'pending'
              ORDER BY r.created_at`,
            [groupId],
          )
        : [];

      return {
        ...toGroupSummary(group),
        courseCode: group.course_code,
        courseTitle: group.course_title,
        // Names only: other students' email addresses are not shared.
        members: members.map((member) => ({
          userId: member.user_id,
          name: member.name,
          isLeader: member.is_leader,
        })),
        pendingRequests: pending.map((row) => ({
          id: row.id,
          userId: row.user_id,
          name: row.name,
          profile: row.has_profile ? toStudentProfile(row) : null,
        })),
      };
    },

    async updateGroup(groupId, viewerId, settings) {
      // Lock the group row first, as approving a request does, so an approval
      // landing at the same moment cannot fill a seat this edit takes away.
      // The member count is a separate, later statement for the reason given
      // in removeCourse: a single statement that waited on the lock would
      // still count the members from before the approval committed.
      return db.transaction(async (query) => {
        const groups = await query<{ leader_id: string }>(
          'SELECT leader_id FROM study_groups WHERE id = $1 FOR UPDATE',
          [groupId],
        );
        const group = groups[0];
        if (group === undefined) return 'group_not_found';
        if (group.leader_id !== viewerId) return 'not_leader';

        const counts = await query<{ members: number }>(
          'SELECT count(*)::int AS members FROM group_members WHERE group_id = $1',
          [groupId],
        );
        if ((counts[0]?.members ?? 0) > settings.maxMembers) return 'size_below_member_count';

        await query(
          `UPDATE study_groups
              SET name = $2, goal = $3, meeting_day = $4, meeting_time = $5,
                  format = $6, location = $7, max_members = $8
            WHERE id = $1`,
          [
            groupId,
            settings.name,
            settings.goal,
            settings.meetingDay,
            settings.meetingTime,
            settings.format,
            settings.location,
            settings.maxMembers,
          ],
        );
        return 'updated';
      });
    },

    async deleteGroup(groupId, viewerId) {
      // One statement, so it is one transaction: group_members and
      // group_join_requests reference the group ON DELETE CASCADE, so the
      // memberships and requests go in the same delete. Locking the row
      // first, as approving does, means an approval in flight finishes
      // before the group goes, and one that comes after finds no group.
      const rows = await query<{ leader_id: string; deleted: boolean }>(
        `WITH target AS (
           SELECT id, leader_id FROM study_groups WHERE id = $1 FOR UPDATE
         ), deleted_group AS (
           DELETE FROM study_groups g
            USING target t
            WHERE g.id = t.id AND t.leader_id = $2
            RETURNING g.id
         )
         SELECT t.leader_id, EXISTS (SELECT 1 FROM deleted_group) AS deleted
           FROM target t`,
        [groupId, viewerId],
      );
      const group = rows[0];
      if (group === undefined) return 'group_not_found';
      return group.deleted ? 'deleted' : 'not_leader';
    },

    async requestToJoin(groupId, viewerId) {
      const rows = await query<{
        max_members: number;
        member_count: string;
        is_member: boolean;
        is_enrolled: boolean;
        request_status: 'pending' | 'approved' | 'declined' | null;
      }>(
        `SELECT g.max_members,
                (SELECT count(*) FROM group_members WHERE group_id = g.id) AS member_count,
                EXISTS (SELECT 1 FROM group_members WHERE group_id = g.id AND user_id = $2) AS is_member,
                EXISTS (SELECT 1 FROM course_enrollments
                         WHERE course_id = g.course_id AND user_id = $2) AS is_enrolled,
                (SELECT status FROM group_join_requests WHERE group_id = g.id AND user_id = $2) AS request_status
           FROM study_groups g
          WHERE g.id = $1`,
        [groupId, viewerId],
      );
      const state = rows[0];
      if (state === undefined) return 'group_not_found';
      if (state.is_member) return 'already_member';
      if (state.request_status === 'pending') return 'already_requested';
      if (!state.is_enrolled) return 'not_enrolled';
      if (Number(state.member_count) >= state.max_members) return 'group_full';

      // A declined student may ask again: the same row goes back to 'pending'.
      // The enrolment is locked and required again here, not just read above:
      // a removal of the course in between deletes it, and then no request is
      // left behind for a course the student no longer has.
      const created = await query(
        `WITH enrollment AS (
           SELECT e.user_id FROM course_enrollments e
             JOIN study_groups g ON g.course_id = e.course_id
            WHERE g.id = $1 AND e.user_id = $2
              FOR SHARE OF e
         )
         INSERT INTO group_join_requests (group_id, user_id)
         SELECT $1::uuid, user_id FROM enrollment
         ON CONFLICT (group_id, user_id) DO UPDATE
           SET status = 'pending', created_at = now(), decided_at = NULL
         RETURNING id`,
        [groupId, viewerId],
      );
      return created.length > 0 ? 'created' : 'not_enrolled';
    },

    async leaveGroup(groupId, viewerId) {
      // The membership goes; the approved request stays as a record of how
      // they joined. Asking again later resets that row to 'pending'.
      const rows = await query<{ leader_id: string; left_group: boolean }>(
        `WITH target AS (
           SELECT id, leader_id FROM study_groups WHERE id = $1
         ), removed AS (
           DELETE FROM group_members m
            USING target t
            WHERE m.group_id = t.id AND m.user_id = $2 AND t.leader_id <> $2
            RETURNING m.user_id
         )
         SELECT t.leader_id, EXISTS (SELECT 1 FROM removed) AS left_group
           FROM target t`,
        [groupId, viewerId],
      );
      const group = rows[0];
      if (group === undefined) return 'group_not_found';
      if (group.leader_id === viewerId) return 'is_leader';
      return group.left_group ? 'left' : 'not_member';
    },

    async withdrawJoinRequest(groupId, viewerId) {
      // Deleted rather than marked: a withdrawn request leaves nothing behind
      // for the leader to see, and asking again simply inserts a new row.
      const withdrawn = await query<{ id: string }>(
        `DELETE FROM group_join_requests
          WHERE group_id = $1 AND user_id = $2 AND status = 'pending'
          RETURNING id`,
        [groupId, viewerId],
      );
      return withdrawn.length > 0 ? 'withdrawn' : 'request_not_found';
    },

    async decideJoinRequest(groupId, requestId, decision, viewerId) {
      const leaders = await query<{ leader_id: string }>(
        'SELECT leader_id FROM study_groups WHERE id = $1',
        [groupId],
      );
      const leader = leaders[0];
      if (leader === undefined) return 'group_not_found';
      if (leader.leader_id !== viewerId) return 'not_leader';

      if (decision === 'decline') {
        const declined = await query<{ id: string }>(
          `UPDATE group_join_requests
              SET status = 'declined', decided_at = now()
            WHERE id = $1 AND group_id = $2 AND status = 'pending'
            RETURNING id`,
          [requestId, groupId],
        );
        return declined.length > 0 ? 'decided' : 'request_not_found';
      }

      // Approve: lock the group row so two approvals (or an approval and an
      // edit that shrinks the group) cannot both take the last seat. The
      // checks and writes are separate, later statements for the reason given
      // in removeCourse: a single statement that waited on the lock would
      // still count the members from before the other transaction committed.
      return db.transaction(async (query) => {
        const groups = await query<{ max_members: number }>(
          'SELECT max_members FROM study_groups WHERE id = $1 FOR UPDATE',
          [groupId],
        );
        const group = groups[0];
        if (group === undefined) return 'group_not_found';

        const requests = await query<{ user_id: string }>(
          `SELECT user_id FROM group_join_requests
            WHERE id = $1 AND group_id = $2 AND status = 'pending'
            FOR UPDATE`,
          [requestId, groupId],
        );
        const request = requests[0];
        if (request === undefined) return 'request_not_found';

        const counts = await query<{ members: number }>(
          'SELECT count(*)::int AS members FROM group_members WHERE group_id = $1',
          [groupId],
        );
        if ((counts[0]?.members ?? 0) >= group.max_members) return 'group_full';

        await query(
          `UPDATE group_join_requests SET status = 'approved', decided_at = now() WHERE id = $1`,
          [requestId],
        );
        await query(
          `INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)
           ON CONFLICT (group_id, user_id) DO NOTHING`,
          [groupId, request.user_id],
        );
        return 'decided';
      });
    },
  };
}

export const postgresGroupRepository = createPostgresGroupRepository(poolDatabase);
