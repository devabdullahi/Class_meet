import type { GroupFormat, GroupSummary } from './api';
import { nextOccurrence } from './calendar';

/**
 * What a group is called on cards, headings and calendar events: its name,
 * or its goal for a group created before groups had names.
 */
export function groupTitle(group: Pick<GroupSummary, 'name' | 'goal'>): string {
  return group.name ?? group.goal;
}

/** The goal, as the line under the title; null when the goal already is the title. */
export function groupGoalLine(group: Pick<GroupSummary, 'name' | 'goal'>): string | null {
  return group.name === null ? null : group.goal;
}

/** "14:30" -> "2:30 PM". */
export function formatMeetingTime(time: string): string {
  const [hourText = '0', minute = '00'] = time.split(':');
  const hour = Number(hourText);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute} ${suffix}`;
}

export function formatLabel(format: GroupFormat): string {
  return format === 'online' ? 'Online' : 'In person';
}

export function isGroupFull(group: Pick<GroupSummary, 'memberCount' | 'maxMembers'>): boolean {
  return group.memberCount >= group.maxMembers;
}

export function seatsLeft(group: Pick<GroupSummary, 'memberCount' | 'maxMembers'>): number {
  return Math.max(0, group.maxMembers - group.memberCount);
}

/**
 * Soonest meeting first, counting from `now`: a Saturday group created
 * yesterday comes after a Monday group when today is Sunday.
 */
export function sortByNextMeeting<Group extends Pick<GroupSummary, 'meetingDay' | 'meetingTime'>>(
  groups: readonly Group[],
  now: Date,
): Group[] {
  const startOf = (group: Group): number => nextOccurrence(group.meetingDay, group.meetingTime, now).getTime();
  return [...groups].sort((first, second) => startOf(first) - startOf(second));
}

const PLATFORM_NAMES: Record<string, string> = {
  'zoom.us': 'Zoom',
  'teams.microsoft.com': 'Microsoft Teams',
  'teams.live.com': 'Microsoft Teams',
  'meet.google.com': 'Google Meet',
};

/** What a meeting link opens, by name where we know it ("Zoom"), else its host. */
export function meetingPlatform(link: string): string {
  let host: string;
  try {
    host = new URL(link).hostname.replace(/^www\./, '');
  } catch {
    return 'Online meeting';
  }
  const known = Object.keys(PLATFORM_NAMES).find((domain) => host === domain || host.endsWith(`.${domain}`));
  return known === undefined ? host : (PLATFORM_NAMES[known] ?? host);
}

/** Where a group meets: the place, or the platform for an online group when the viewer may see its link. */
export function meetingPlaceLabel(group: Pick<GroupSummary, 'format' | 'location'>): string {
  if (group.format === 'in_person') return group.location ?? '';
  return group.location === null ? 'Online' : `Online · ${meetingPlatform(group.location)}`;
}
