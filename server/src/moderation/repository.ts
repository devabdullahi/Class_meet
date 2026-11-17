/**
 * All SQL for reports and moderation. Routers depend on the
 * `ModerationRepository` interface, not on Postgres, as they do for groups.
 *
 * A report is about a target: a whole group, or one member of a group. The
 * moderators' queue shows one row per target with open reports, and a
 * moderator's decision resolves every open report about that target at once.
 */
import { poolDatabase, type Database } from '../db/pool.js';
import type { ReportInput, ReportReason } from './validation.js';

export type ReportOutcome = 'kept' | 'removed' | 'removed_from_group';

/** One of the viewer's own open reports about a group, for the "you reported" notice. */
export interface MyOpenReport {
  /** Null when the whole group was reported. */
  memberId: string | null;
  memberName: string | null;
  reportedAt: string;
}

export type CreateReportResult =
  | { outcome: 'created'; report: MyOpenReport }
  | { outcome: 'group_not_found' }
  | { outcome: 'member_not_found' }
  | { outcome: 'reporting_self' }
  | { outcome: 'own_group' }
  | { outcome: 'already_reported' };

/** What is left of a group a moderator removed, to explain its old link. */
export interface RemovedGroup {
  groupId: string;
  title: string;
  courseId: string;
  courseCode: string;
  removedAt: string;
}

export interface ReportedMember {
  userId: string;
  name: string;
  isLeader: boolean;
  /** False once they have left the group (or been taken out of it). */
  inGroup: boolean;
}

/** A group, or a member of one, with open reports: one row of the moderators' queue. */
export interface OpenReportTarget {
  groupId: string;
  groupTitle: string;
  courseId: string;
  courseCode: string;
  leaderName: string;
  memberCount: number;
  /** Null when the reports are about the whole group. */
  member: ReportedMember | null;
  reportCount: number;
  /** The most recent report, shown as the example of what students said. */
  latestReport: {
    reason: ReportReason;
    details: string | null;
    reporterName: string;
    reportedAt: string;
  };
}

/** One moderator decision: every report it resolved about one target. */
export interface ResolvedReportTarget {
  groupId: string;
  /**
   * The group's current name, or its name when it was removed. Null only for
   * a group its leader deleted after the reports were resolved.
   */
  groupTitle: string | null;
  courseCode: string | null;
  /** Null when the reports were about the whole group. */
  memberName: string | null;
  reportCount: number;
  /** The reason students gave most often. */
  reason: ReportReason;
  outcome: ReportOutcome;
  resolvedAt: string;
  resolvedById: string;
  resolvedByName: string;
}

export interface ReportTarget {
  groupId: string;
  /** Null for the whole group. */
  memberId: string | null;
}

export type KeepOutcome = 'kept' | 'no_open_reports';
export type RemoveGroupOutcome = 'removed' | 'group_not_found';
export type RemoveMemberOutcome = 'removed' | 'group_not_found' | 'is_leader' | 'not_member';

/** The resolved list shows recent decisions; older ones stay in the table. */
export const RESOLVED_LIST_LIMIT = 50;

export interface ModerationRepository {
  /** Read on every moderation request, so granting or revoking takes effect at once. */
  isModerator(userId: string): Promise<boolean>;
  /**
   * Any signed-in student may report a group they can open, or a member of it,
   * but not themselves and not a group they lead.
   */
  createReport(reporterId: string, groupId: string, input: ReportInput): Promise<CreateReportResult>;
  /** Only the viewer's own reports: nobody else ever learns who reported a group. */
  listMyOpenReports(reporterId: string, groupId: string): Promise<MyOpenReport[]>;
  findRemovedGroup(groupId: string): Promise<RemovedGroup | null>;
  /** Targets in the queue, which is what the navigation badge counts. */
  countOpenTargets(): Promise<number>;
  /** Most reported first; among equals, the one waiting longest. */
  listOpenTargets(): Promise<OpenReportTarget[]>;
  /** Newest first, at most RESOLVED_LIST_LIMIT. */
  listResolvedTargets(): Promise<ResolvedReportTarget[]>;
  countResolvedTargets(): Promise<number>;
  /** Resolves the target's open reports, changing nothing else. */
  keepTarget(target: ReportTarget, moderatorId: string): Promise<KeepOutcome>;
  /**
   * Deletes the group as its leader can (members and requests go with it),
   * leaves a removed_groups record behind, and resolves every open report
   * about the group or its members.
   */
  removeGroup(groupId: string, moderatorId: string): Promise<RemoveGroupOutcome>;
  /** Takes the member out of the group and resolves the open reports about them. */
  removeMember(groupId: string, memberId: string, moderatorId: string): Promise<RemoveMemberOutcome>;
}

interface OpenTargetRow {
  group_id: string;
  group_title: string;
  course_id: string;
  course_code: string;
  leader_name: string;
  member_count: number;
  member_id: string | null;
  member_name: string | null;
  member_is_leader: boolean | null;
  member_in_group: boolean | null;
  report_count: number;
  reason: ReportReason;
  details: string | null;
  reporter_name: string;
  reported_at: Date;
}

interface ResolvedTargetRow {
  group_id: string;
  group_title: string | null;
  course_code: string | null;
  member_name: string | null;
  report_count: number;
  reason: ReportReason;
  outcome: ReportOutcome;
  resolved_at: Date;
  resolved_by_id: string;
  resolved_by_name: string;
}

function toOpenReportTarget(row: OpenTargetRow): OpenReportTarget {
  return {
    groupId: row.group_id,
    groupTitle: row.group_title,
    courseId: row.course_id,
    courseCode: row.course_code,
    leaderName: row.leader_name,
    memberCount: row.member_count,
    member:
      row.member_id === null
        ? null
        : {
            userId: row.member_id,
            name: row.member_name ?? '',
            isLeader: row.member_is_leader === true,
            inGroup: row.member_in_group === true,
          },
    reportCount: row.report_count,
    latestReport: {
      reason: row.reason,
      details: row.details,
      reporterName: row.reporter_name,
      reportedAt: row.reported_at.toISOString(),
    },
  };
}

function toResolvedReportTarget(row: ResolvedTargetRow): ResolvedReportTarget {
  return {
    groupId: row.group_id,
    groupTitle: row.group_title,
    courseCode: row.course_code,
    memberName: row.member_name,
    reportCount: row.report_count,
    reason: row.reason,
    outcome: row.outcome,
    resolvedAt: row.resolved_at.toISOString(),
    resolvedById: row.resolved_by_id,
    resolvedByName: row.resolved_by_name,
  };
}

/** The repository over a real Postgres (the pool in production, PGlite in the tests). */
export function createPostgresModerationRepository(db: Database): ModerationRepository {
  const { query } = db;
  return {
    async isModerator(userId) {
      const rows = await query<{ is_moderator: boolean }>('SELECT is_moderator FROM users WHERE id = $1', [userId]);
      return rows[0]?.is_moderator === true;
    },

    async createReport(reporterId, groupId, input) {
      // The group row is locked FOR SHARE, so a moderator removing the group
      // (or the member) at the same moment, which locks it FOR UPDATE, either
      // finishes first and this finds nothing, or waits for this report and
      // then resolves it along with the others.
      return db.transaction(async (query) => {
        const groups = await query<{ leader_id: string }>(
          'SELECT leader_id FROM study_groups WHERE id = $1 FOR SHARE',
          [groupId],
        );
        const group = groups[0];
        if (group === undefined) return { outcome: 'group_not_found' };

        if (input.memberId === null) {
          // A leader who wants their group gone can delete it.
          if (group.leader_id === reporterId) return { outcome: 'own_group' };
        } else {
          if (input.memberId === reporterId) return { outcome: 'reporting_self' };
          const members = await query('SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [
            groupId,
            input.memberId,
          ]);
          if (members.length === 0) return { outcome: 'member_not_found' };
        }

        // The unique index allows one open report per student per target, so
        // a second one (a double click, or a second tab) inserts nothing.
        const created = await query<{ created_at: Date; member_name: string | null }>(
          `WITH new_report AS (
             INSERT INTO reports (reporter_id, group_id, reported_user_id, reason, details)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (reporter_id, group_id, reported_user_id) WHERE status = 'open' DO NOTHING
             RETURNING created_at, reported_user_id
           )
           SELECT r.created_at, u.name AS member_name
             FROM new_report r
             LEFT JOIN users u ON u.id = r.reported_user_id`,
          [reporterId, groupId, input.memberId, input.reason, input.details],
        );
        const row = created[0];
        if (row === undefined) return { outcome: 'already_reported' };
        return {
          outcome: 'created',
          report: {
            memberId: input.memberId,
            memberName: row.member_name,
            reportedAt: row.created_at.toISOString(),
          },
        };
      });
    },

    async listMyOpenReports(reporterId, groupId) {
      const rows = await query<{ member_id: string | null; member_name: string | null; created_at: Date }>(
        `SELECT r.reported_user_id AS member_id, u.name AS member_name, r.created_at
           FROM reports r
           LEFT JOIN users u ON u.id = r.reported_user_id
          WHERE r.reporter_id = $1 AND r.group_id = $2 AND r.status = 'open'
          ORDER BY r.created_at`,
        [reporterId, groupId],
      );
      return rows.map((row) => ({
        memberId: row.member_id,
        memberName: row.member_name,
        reportedAt: row.created_at.toISOString(),
      }));
    },

    async findRemovedGroup(groupId) {
      const rows = await query<{ title: string; course_id: string; course_code: string; removed_at: Date }>(
        `SELECT rg.title, rg.course_id, c.code AS course_code, rg.removed_at
           FROM removed_groups rg
           JOIN courses c ON c.id = rg.course_id
          WHERE rg.group_id = $1`,
        [groupId],
      );
      const row = rows[0];
      if (row === undefined) return null;
      return {
        groupId,
        title: row.title,
        courseId: row.course_id,
        courseCode: row.course_code,
        removedAt: row.removed_at.toISOString(),
      };
    },

    async countOpenTargets() {
      // Joined to study_groups like the queue itself, so the badge never
      // counts reports about a group its leader has since deleted.
      const rows = await query<{ count: number }>(
        `SELECT count(*)::int AS count
           FROM (SELECT DISTINCT r.group_id, r.reported_user_id
                   FROM reports r
                   JOIN study_groups g ON g.id = r.group_id
                  WHERE r.status = 'open') AS targets`,
      );
      return rows[0]?.count ?? 0;
    },

    async listOpenTargets() {
      // One row per target (group, member-or-null). The window functions
      // count each target's open reports and number them newest first, so
      // the outer query keeps the latest one as the example to show.
      const rows = await query<OpenTargetRow>(
        `WITH open_reports AS (
           SELECT r.*,
                  count(*) OVER target_reports AS report_count,
                  min(r.created_at) OVER target_reports AS first_reported_at,
                  row_number() OVER (target_reports ORDER BY r.created_at DESC) AS recency
             FROM reports r
            WHERE r.status = 'open'
           WINDOW target_reports AS (PARTITION BY r.group_id, r.reported_user_id)
         )
         SELECT o.group_id,
                COALESCE(g.name, g.goal) AS group_title,
                g.course_id,
                c.code AS course_code,
                leader.name AS leader_name,
                (SELECT count(*)::int FROM group_members m WHERE m.group_id = g.id) AS member_count,
                o.reported_user_id AS member_id,
                member.name AS member_name,
                (o.reported_user_id = g.leader_id) AS member_is_leader,
                EXISTS (SELECT 1 FROM group_members m
                         WHERE m.group_id = g.id AND m.user_id = o.reported_user_id) AS member_in_group,
                o.report_count::int AS report_count,
                o.reason,
                o.details,
                reporter.name AS reporter_name,
                o.created_at AS reported_at
           FROM open_reports o
           JOIN study_groups g ON g.id = o.group_id
           JOIN courses c ON c.id = g.course_id
           JOIN users leader ON leader.id = g.leader_id
           JOIN users reporter ON reporter.id = o.reporter_id
           LEFT JOIN users member ON member.id = o.reported_user_id
          WHERE o.recency = 1
          ORDER BY o.report_count DESC, o.first_reported_at, o.group_id`,
      );
      return rows.map(toOpenReportTarget);
    },

    async listResolvedTargets() {
      // Reports resolved by one decision share its moderator and timestamp
      // (now() is fixed for the transaction), so grouping by those turns
      // them back into the one decision. The group may since have been
      // removed (removed_groups names it) or deleted by its leader.
      const rows = await query<ResolvedTargetRow>(
        `SELECT r.group_id,
                COALESCE(g.name, g.goal, rg.title) AS group_title,
                c.code AS course_code,
                member.name AS member_name,
                count(*)::int AS report_count,
                mode() WITHIN GROUP (ORDER BY r.reason) AS reason,
                r.outcome,
                r.resolved_at,
                r.resolved_by AS resolved_by_id,
                moderator.name AS resolved_by_name
           FROM reports r
           LEFT JOIN study_groups g ON g.id = r.group_id
           LEFT JOIN removed_groups rg ON rg.group_id = r.group_id
           LEFT JOIN courses c ON c.id = COALESCE(g.course_id, rg.course_id)
           LEFT JOIN users member ON member.id = r.reported_user_id
           JOIN users moderator ON moderator.id = r.resolved_by
          WHERE r.status = 'resolved'
          GROUP BY r.group_id, r.reported_user_id, r.outcome, r.resolved_at, r.resolved_by,
                   g.name, g.goal, rg.title, c.code, member.name, moderator.name
          ORDER BY r.resolved_at DESC, r.group_id
          LIMIT ${RESOLVED_LIST_LIMIT}`,
      );
      return rows.map(toResolvedReportTarget);
    },

    async countResolvedTargets() {
      const rows = await query<{ count: number }>(
        `SELECT count(*)::int AS count
           FROM (SELECT DISTINCT group_id, reported_user_id, resolved_at
                   FROM reports
                  WHERE status = 'resolved') AS decisions`,
      );
      return rows[0]?.count ?? 0;
    },

    async keepTarget(target, moderatorId) {
      const kept = await query(
        `UPDATE reports
            SET status = 'resolved', outcome = 'kept', resolved_by = $3, resolved_at = now()
          WHERE status = 'open' AND group_id = $1 AND reported_user_id IS NOT DISTINCT FROM $2::uuid
          RETURNING id`,
        [target.groupId, target.memberId, moderatorId],
      );
      return kept.length > 0 ? 'kept' : 'no_open_reports';
    },

    async removeGroup(groupId, moderatorId) {
      // Locked FOR UPDATE first, as the leader's own delete does, so an
      // approval or a new report in flight finishes before the group goes.
      return db.transaction(async (query) => {
        const groups = await query<{ course_id: string; title: string }>(
          'SELECT course_id, COALESCE(name, goal) AS title FROM study_groups WHERE id = $1 FOR UPDATE',
          [groupId],
        );
        const group = groups[0];
        if (group === undefined) return 'group_not_found';

        await query(
          'INSERT INTO removed_groups (group_id, course_id, title, removed_by) VALUES ($1, $2, $3, $4)',
          [groupId, group.course_id, group.title, moderatorId],
        );
        // Reports about its members too: with the group gone there is
        // nothing left to take them out of.
        await query(
          `UPDATE reports
              SET status = 'resolved', outcome = 'removed', resolved_by = $2, resolved_at = now()
            WHERE status = 'open' AND group_id = $1`,
          [groupId, moderatorId],
        );
        // The same delete the leader's Delete group runs: group_members and
        // group_join_requests go with it by ON DELETE CASCADE.
        await query('DELETE FROM study_groups WHERE id = $1', [groupId]);
        return 'removed';
      });
    },

    async removeMember(groupId, memberId, moderatorId) {
      // The group row is locked, as approving a request does, so the member
      // cannot be approved back in while they are being taken out.
      return db.transaction(async (query) => {
        const groups = await query<{ leader_id: string }>(
          'SELECT leader_id FROM study_groups WHERE id = $1 FOR UPDATE',
          [groupId],
        );
        const group = groups[0];
        if (group === undefined) return 'group_not_found';
        // A group cannot be left without its leader; removing the group is
        // the way to act on a leader.
        if (group.leader_id === memberId) return 'is_leader';

        const removed = await query(
          'DELETE FROM group_members WHERE group_id = $1 AND user_id = $2 RETURNING user_id',
          [groupId, memberId],
        );
        if (removed.length === 0) return 'not_member';

        await query(
          `UPDATE reports
              SET status = 'resolved', outcome = 'removed_from_group', resolved_by = $3, resolved_at = now()
            WHERE status = 'open' AND group_id = $1 AND reported_user_id = $2`,
          [groupId, memberId, moderatorId],
        );
        return 'removed';
      });
    },
  };
}

export const postgresModerationRepository = createPostgresModerationRepository(poolDatabase);
