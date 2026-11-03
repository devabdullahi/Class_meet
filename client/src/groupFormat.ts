import type { GroupFormat, GroupSummary } from './api';

/** "14:30" -> "2:30 PM". */
export function formatMeetingTime(time: string): string {
  const [hourText = '0', minute = '00'] = time.split(':');
  const hour = Number(hourText);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute} ${suffix}`;
}

export function formatLabel(format: GroupFormat): string {
  return format === 'online' ? 'Online' : 'In Person';
}

export function isGroupFull(group: Pick<GroupSummary, 'memberCount' | 'maxMembers'>): boolean {
  return group.memberCount >= group.maxMembers;
}
