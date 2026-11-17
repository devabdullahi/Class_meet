/**
 * Small pieces shared by the Study Groups and Group Details screens, so a
 * meeting time, a seat count and the viewer's relationship read the same
 * everywhere. None of them uses colour to carry meaning: order (soonest
 * first), type weight and plain words do that work.
 */
import type { ReactNode } from 'react';
import type { GroupSummary, MeetingDay } from '../api';
import { formatMeetingTime } from '../groupFormat';

/** When the group meets, as a tile: the weekday above the clock time. Dimmed when the group is full. */
export function TimeTile({ day, time, full }: { day: MeetingDay; time: string; full: boolean }): ReactNode {
  const [clock = '', period = ''] = formatMeetingTime(time).split(' ');
  return (
    <span className={full ? 'cm-time cm-time--full' : 'cm-time'}>
      <span className="cm-time__day">{day.slice(0, 3)}</span>
      <span className="cm-time__clock">{clock}</span>
      <span className="cm-time__period">{period}</span>
    </span>
  );
}

/**
 * "2 seats left of 4", or "Full". Seats left is what a student deciding
 * whether to ask wants to know, so it leads and carries the weight.
 */
export function SeatCount({ taken, max }: { taken: number; max: number }): ReactNode {
  const left = Math.max(0, max - taken);
  if (left === 0) {
    return (
      <span className="cm-seats">
        <strong>Full</strong> · {max} of {max} seats taken
      </span>
    );
  }
  return (
    <span className="cm-seats">
      <strong>
        {left} {left === 1 ? 'seat' : 'seats'} left
      </strong>{' '}
      of {max}
    </span>
  );
}

/** The viewer's own relationship to a group, as a plain label, if they have one. */
export function RelationshipLabel({
  group,
}: {
  group: Pick<GroupSummary, 'viewerRole' | 'viewerRequestStatus'>;
}): ReactNode {
  const label =
    group.viewerRole === 'leader'
      ? 'You lead'
      : group.viewerRole === 'member'
        ? 'You’re in'
        : group.viewerRequestStatus === 'pending'
          ? 'Requested'
          : null;
  return label === null ? null : <span className="cm-tag">{label}</span>;
}
