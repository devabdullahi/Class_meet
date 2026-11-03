/**
 * All SQL for courses, enrollments, study groups and join requests. Routers
 * depend on the `GroupRepository` interface, not on Postgres, so they are
 * testable with an in-memory fake and the database stays behind one boundary.
 */
import { query } from '../db/pool.js';
import type { CreateGroupInput, GroupFormat, JoinDecision, MeetingDay } from './validation.js';

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
}

export interface GroupSummary {
  id: string;
  courseId: string;
  goal: string;
  meetingDay: MeetingDay;
  meetingTime: string;
  format: GroupFormat;
  location: string;
  maxMembers: number;
  memberCount: number;
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

export type ViewerRole = 'leader' | 'member' | 'none';

export interface GroupDetails extends GroupSummary {
  courseCode: string;
  courseTitle: string;
  members: GroupMember[];
  /** The viewing student's relationship to the group. */
  viewerRole: ViewerRole;
  /** The viewer's own request, if any. Declined requests may be sent again. */
  viewerRequestStatus: 'pending' | 'declined' | null;
  /** Only filled in for the group's leader. */
  pendingRequests: PendingJoinRequest[];
}

export type JoinRequestOutcome = 'created' | 'group_not_found' | 'already_member' | 'already_requested' | 'group_full';

export type DecisionOutcome = 'decided' | 'group_not_found' | 'not_leader' | 'request_not_found' | 'group_full';

export interface GroupRepository {
  listCourses(search: string, viewerId: string): Promise<CourseSearchResult[]>;
  listMyCourses(viewerId: string): Promise<EnrolledCourse[]>;
  enrollInCourse(viewerId: string, courseId: string): Promise<void>;
  findCourse(courseId: string): Promise<Course | null>;
  listGroupsForCourse(courseId: string): Promise<GroupSummary[]>;
  createGroup(leaderId: string, input: CreateGroupInput): Promise<string>;
  findGroup(groupId: string, viewerId: string): Promise<GroupDetails | null>;
  requestToJoin(groupId: string, viewerId: string): Promise<JoinRequestOutcome>;
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
  goal: string;
  meeting_day: MeetingDay;
  meeting_time: string;
  format: GroupFormat;
  location: string;
  max_members: number;
  member_count: string;
}

const GROUP_SUMMARY_COLUMNS = `g.id, g.course_id, g.goal, g.meeting_day,
       to_char(g.meeting_time, 'HH24:MI') AS meeting_time,
       g.format, g.location, g.max_members,
       (SELECT count(*) FROM group_members m WHERE m.group_id = g.id) AS member_count`;

const MAX_COURSE_SEARCH_RESULTS = 50;

function toGroupSummary(row: GroupRow): GroupSummary {
  return {
    id: row.id,
    courseId: row.course_id,
    goal: row.goal,
    meetingDay: row.meeting_day,
    meetingTime: row.meeting_time,
    format: row.format,
    location: row.location,
    maxMembers: row.max_members,
    // count(*) comes back from pg as a string (bigint).
    memberCount: Number(row.member_count),
  };
}

/** Escape LIKE wildcards so a search for "100%" matches literally. */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export const postgresGroupRepository: GroupRepository = {
  async listCourses(search, viewerId) {
    const pattern = `%${escapeLike(search)}%`;
    return query<CourseSearchResult>(
      `SELECT c.id, c.code, c.title,
              EXISTS (SELECT 1 FROM course_enrollments e
                       WHERE e.course_id = c.id AND e.user_id = $2) AS enrolled
         FROM courses c
        WHERE c.code ILIKE $1 OR c.title ILIKE $1
        ORDER BY c.code
        LIMIT ${MAX_COURSE_SEARCH_RESULTS}`,
      [pattern, viewerId],
    );
  },

  async listMyCourses(viewerId) {
    const rows = await query<Course & { group_count: string }>(
      `SELECT c.id, c.code, c.title,
              (SELECT count(*) FROM study_groups g WHERE g.course_id = c.id) AS group_count
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

  async findCourse(courseId) {
    const rows = await query<Course>('SELECT id, code, title FROM courses WHERE id = $1', [courseId]);
    return rows[0] ?? null;
  },

  async listGroupsForCourse(courseId) {
    const rows = await query<GroupRow>(
      `SELECT ${GROUP_SUMMARY_COLUMNS}
         FROM study_groups g
        WHERE g.course_id = $1
        ORDER BY g.created_at DESC`,
      [courseId],
    );
    return rows.map(toGroupSummary);
  },

  async createGroup(leaderId, input) {
    // One statement, so the group and its leader's membership are created
    // together or not at all.
    const rows = await query<{ id: string }>(
      `WITH new_group AS (
         INSERT INTO study_groups
           (course_id, leader_id, goal, meeting_day, meeting_time, format, location, max_members)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, leader_id
       ), leader_membership AS (
         INSERT INTO group_members (group_id, user_id)
         SELECT id, leader_id FROM new_group
       )
       SELECT id FROM new_group`,
      [
        input.courseId,
        leaderId,
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
    const groups = await query<
      GroupRow & { course_code: string; course_title: string; leader_id: string }
    >(
      `SELECT ${GROUP_SUMMARY_COLUMNS}, g.leader_id, c.code AS course_code, c.title AS course_title
         FROM study_groups g
         JOIN courses c ON c.id = g.course_id
        WHERE g.id = $1`,
      [groupId],
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

    const isLeader = group.leader_id === viewerId;
    const isMember = members.some((member) => member.user_id === viewerId);

    const ownRequests = await query<{ status: 'pending' | 'approved' | 'declined' }>(
      'SELECT status FROM group_join_requests WHERE group_id = $1 AND user_id = $2',
      [groupId, viewerId],
    );
    const ownStatus = ownRequests[0]?.status;

    const pending = isLeader
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
      viewerRole: isLeader ? 'leader' : isMember ? 'member' : 'none',
      viewerRequestStatus: ownStatus === 'pending' || ownStatus === 'declined' ? ownStatus : null,
      pendingRequests: pending.map((row) => ({ id: row.id, userId: row.user_id, name: row.name })),
    };
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
