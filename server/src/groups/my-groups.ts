/**
 * The My groups lists: a student's groups sorted by their relationship to
 * each one. Pure, so where an approved or declined request ends up, and who
 * gets a pending-request count, is testable without a database.
 */
import type { GroupSummary } from './repository.js';

/** A group as My groups lists it: the summary plus the course it belongs to. */
export interface MyGroupSummary extends GroupSummary {
  courseCode: string;
  courseTitle: string;
}

export interface LedGroupSummary extends MyGroupSummary {
  /** Join requests waiting for the leader's answer. */
  pendingRequestCount: number;
}

export interface MyGroups {
  leading: LedGroupSummary[];
  member: MyGroupSummary[];
  /** Groups the student asked to join; `viewerRequestStatus` is 'pending' or 'declined'. */
  requested: MyGroupSummary[];
}

/**
 * Splits groups by the viewer's role. The pending-request count is kept for
 * groups the viewer leads only: how many students want into a group is the
 * leader's business. An approved request needs no entry of its own, because
 * the student is then a member.
 */
export function groupByRelationship(groups: readonly LedGroupSummary[]): MyGroups {
  const myGroups: MyGroups = { leading: [], member: [], requested: [] };
  for (const { pendingRequestCount, ...group } of groups) {
    if (group.viewerRole === 'leader') {
      myGroups.leading.push({ ...group, pendingRequestCount });
    } else if (group.viewerRole === 'member') {
      myGroups.member.push(group);
    } else if (group.viewerRequestStatus !== null) {
      myGroups.requested.push(group);
    }
  }
  return myGroups;
}
