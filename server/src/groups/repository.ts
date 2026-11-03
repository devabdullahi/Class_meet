/**
 * All SQL for courses and study groups. Routers depend on the
 * `GroupRepository` interface, not on Postgres, so they are testable with an
 * in-memory fake and the database stays behind one boundary.
 */
import { query } from '../db/pool.js';
import type { CreateGroupInput, GroupFormat, MeetingDay } from './validation.js';

export interface Course {
  id: string;
  code: string;
  title: string;
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

export interface GroupDetails extends GroupSummary {
  courseCode: string;
  courseTitle: string;
  members: GroupMember[];
}

export interface GroupRepository {
  listCourses(search: string): Promise<Course[]>;
  courseExists(courseId: string): Promise<boolean>;
  listGroupsForCourse(courseId: string): Promise<GroupSummary[]>;
  createGroup(leaderId: string, input: CreateGroupInput): Promise<string>;
  findGroup(groupId: string): Promise<GroupDetails | null>;
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
  async listCourses(search) {
    const pattern = `%${escapeLike(search)}%`;
    return query<Course>(
      `SELECT id, code, title
         FROM courses
        WHERE code ILIKE $1 OR title ILIKE $1
        ORDER BY code`,
      [pattern],
    );
  },

  async courseExists(courseId) {
    const rows = await query<{ id: string }>('SELECT id FROM courses WHERE id = $1', [courseId]);
    return rows.length > 0;
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

  async findGroup(groupId) {
    const groups = await query<GroupRow & { course_code: string; course_title: string }>(
      `SELECT ${GROUP_SUMMARY_COLUMNS}, c.code AS course_code, c.title AS course_title
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
    };
  },
};
