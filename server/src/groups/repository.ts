/**
 * All SQL for courses, enrollments, study groups and join requests. Routers
 * depend on the `GroupRepository` interface, not on Postgres, so they are
 * testable with an in-memory fake and the database stays behind one boundary.
 */
import { query } from '../db/pool.js';
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
}

export interface GroupDetails extends GroupSummary {
  courseCode: string;
  courseTitle: string;
  members: GroupMember[];
  /** Only filled in for the group's leader. */
  pendingRequests: PendingJoinRequest[];
}

export type JoinRequestOutcome = 'created' | 'group_not_found' | 'already_member' | 'already_requested' | 'group_full';

export type DecisionOutcome = 'decided' | 'group_not_found' | 'not_leader' | 'request_not_found' | 'group_full';

export type WithdrawOutcome = 'withdrawn' | 'request_not_found';

export type UpdateGroupOutcome = 'updated' | 'group_not_found' | 'not_leader' | 'size_below_member_count';

export type LeaveGroupOutcome = 'left' | 'group_not_found' | 'is_leader' | 'not_member';

export type RemoveCourseOutcome = 'removed' | 'not_enrolled' | 'leads_group' | 'in_group';

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
  listGroupsForCourse(courseId: string, viewerId: string): Promise<GroupSummary[]>;
  /** Groups the viewer leads, belongs to, or has a pending or declined request for. */
  listMyGroups(viewerId: string): Promise<MyGroups>;
  /** Pending join requests across every group the viewer leads. */
  countPendingRequestsForLeader(viewerId: string): Promise<number>;
  createGroup(leaderId: string, input: CreateGroupInput): Promise<string>;
  findGroup(groupId: string, viewerId: string): Promise<GroupDetails | null>;
  /** Leader only. The size may not drop below the members already in the group. */
  updateGroup(groupId: string, viewerId: string, settings: GroupSettings): Promise<UpdateGroupOutcome>;
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

export const postgresGroupRepository: GroupRepository = {
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
      Course & { group_count: string; open_group_count: string; joined_group_count: string }
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
              ) AS joined_group_count
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
    // One statement, so the check and both deletes happen together or not
    // at all. The rule: a student in one of the course's groups (leading it
    // or not) keeps the course until they leave; a leader cannot leave, so
    // a leader keeps it. That way My groups never lists a group whose
    // course is missing from My courses. Pending and declined requests to
    // the course's groups are withdrawn, so no leader is left answering a
    // student who has dropped the course.
    const rows = await query<{ leads: boolean; member: boolean; removed: boolean }>(
      `WITH course_groups AS (
         SELECT id, leader_id FROM study_groups WHERE course_id = $2
       ), blockers AS (
         SELECT EXISTS (SELECT 1 FROM course_groups WHERE leader_id = $1) AS leads,
                EXISTS (SELECT 1 FROM group_members m JOIN course_groups g ON g.id = m.group_id
                         WHERE m.user_id = $1) AS member
       ), removed_enrollment AS (
         DELETE FROM course_enrollments e
          USING blockers b
          WHERE e.user_id = $1 AND e.course_id = $2 AND NOT b.leads AND NOT b.member
          RETURNING e.course_id
       ), withdrawn_requests AS (
         DELETE FROM group_join_requests r
          WHERE EXISTS (SELECT 1 FROM removed_enrollment)
            AND r.user_id = $1 AND r.status IN ('pending', 'declined')
            AND r.group_id IN (SELECT id FROM course_groups)
       )
       SELECT b.leads, b.member, EXISTS (SELECT 1 FROM removed_enrollment) AS removed
         FROM blockers b`,
      [viewerId, courseId],
    );
    const state = rows[0];
    if (state === undefined) {
      throw new Error('removeCourse: the blockers row is always produced');
    }
    if (state.leads) return 'leads_group';
    if (state.member) return 'in_group';
    return state.removed ? 'removed' : 'not_enrolled';
  },

  async findCourse(courseId) {
    const rows = await query<Course>('SELECT id, code, title FROM courses WHERE id = $1', [courseId]);
    return rows[0] ?? null;
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
    // together or not at all.
    const rows = await query<{ id: string }>(
      `WITH new_group AS (
         INSERT INTO study_groups
           (course_id, leader_id, name, goal, meeting_day, meeting_time, format, location, max_members)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
    if (row === undefined) {
      throw new Error('createGroup: INSERT ... RETURNING produced no row');
    }
    return row.id;
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

    const pending = group.viewer_role === 'leader'
      ? await query<{ id: string; user_id: string; name: string }>(
          `SELECT r.id, r.user_id, u.name
             FROM group_join_requests r
             JOIN users u ON u.id = r.user_id
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
      pendingRequests: pending.map((row) => ({ id: row.id, userId: row.user_id, name: row.name })),
    };
  },

  async updateGroup(groupId, viewerId, settings) {
    // Lock the group row, as approving a request does, so a request approved
    // at the same moment cannot fill a seat this edit is taking away.
    const rows = await query<{ leader_id: string; updated: boolean }>(
      `WITH locked_group AS (
         SELECT id, leader_id FROM study_groups WHERE id = $1 FOR UPDATE
       ), updated_group AS (
         UPDATE study_groups g
            SET name = $3, goal = $4, meeting_day = $5, meeting_time = $6,
                format = $7, location = $8, max_members = $9
           FROM locked_group l
          WHERE g.id = l.id AND l.leader_id = $2
            AND (SELECT count(*) FROM group_members m WHERE m.group_id = l.id) <= $9
          RETURNING g.id
       )
       SELECT l.leader_id, EXISTS (SELECT 1 FROM updated_group) AS updated
         FROM locked_group l`,
      [
        groupId,
        viewerId,
        settings.name,
        settings.goal,
        settings.meetingDay,
        settings.meetingTime,
        settings.format,
        settings.location,
        settings.maxMembers,
      ],
    );
    const group = rows[0];
    if (group === undefined) return 'group_not_found';
    if (group.leader_id !== viewerId) return 'not_leader';
    return group.updated ? 'updated' : 'size_below_member_count';
  },

  async requestToJoin(groupId, viewerId) {
    const rows = await query<{
      max_members: number;
      member_count: string;
      is_member: boolean;
      request_status: 'pending' | 'approved' | 'declined' | null;
    }>(
      `SELECT g.max_members,
              (SELECT count(*) FROM group_members WHERE group_id = g.id) AS member_count,
              EXISTS (SELECT 1 FROM group_members WHERE group_id = g.id AND user_id = $2) AS is_member,
              (SELECT status FROM group_join_requests WHERE group_id = g.id AND user_id = $2) AS request_status
         FROM study_groups g
        WHERE g.id = $1`,
      [groupId, viewerId],
    );
    const state = rows[0];
    if (state === undefined) return 'group_not_found';
    if (state.is_member) return 'already_member';
    if (state.request_status === 'pending') return 'already_requested';
    if (Number(state.member_count) >= state.max_members) return 'group_full';

    // A declined student may ask again: the same row goes back to 'pending'.
    await query(
      `INSERT INTO group_join_requests (group_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (group_id, user_id) DO UPDATE
         SET status = 'pending', created_at = now(), decided_at = NULL`,
      [groupId, viewerId],
    );
    return 'created';
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

    // Approve: lock the group row so two approvals cannot both take the last
    // seat, then mark the request and add the member in one statement.
    const approved = await query<{ approved: number }>(
      `WITH locked_group AS (
         SELECT id, max_members FROM study_groups WHERE id = $2 FOR UPDATE
       ), approved_request AS (
         UPDATE group_join_requests r
            SET status = 'approved', decided_at = now()
           FROM locked_group g
          WHERE r.id = $1 AND r.group_id = g.id AND r.status = 'pending'
            AND (SELECT count(*) FROM group_members m WHERE m.group_id = g.id) < g.max_members
         RETURNING r.group_id, r.user_id
       ), new_member AS (
         INSERT INTO group_members (group_id, user_id)
         SELECT group_id, user_id FROM approved_request
         ON CONFLICT (group_id, user_id) DO NOTHING
       )
       SELECT count(*)::int AS approved FROM approved_request`,
      [requestId, groupId],
    );
    if ((approved[0]?.approved ?? 0) > 0) return 'decided';

    // Nothing changed: either the request is not pending, or the group is full.
    const stillPending = await query<{ id: string }>(
      `SELECT id FROM group_join_requests WHERE id = $1 AND group_id = $2 AND status = 'pending'`,
      [requestId, groupId],
    );
    return stillPending.length > 0 ? 'group_full' : 'request_not_found';
  },
};
