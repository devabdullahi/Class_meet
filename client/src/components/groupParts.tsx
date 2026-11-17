/**
 * Small pieces shared by the Study Groups and Group Details screens, so a
 * meeting time, a seat count and an Open/Full label look the same everywhere.
 */
import type { ReactNode } from 'react';
import type { GroupSummary, MeetingDay } from '../api';
import { formatMeetingTime } from '../groupFormat';

/**
 * How a time tile is coloured: solid orange for groups you lead or belong to,
 * a light orange tint for groups you could join, slate for full ones. Only
 * your own meetings get the loudest colour on the page.
 */
export type TimeTileTone = 'yours' | 'open' | 'full';

/** When the group meets, as a tile: the weekday above the clock time. */
export function TimeTile({ day, time, tone }: { day: MeetingDay; time: string; tone: TimeTileTone }): ReactNode {
  const [clock = '', period = ''] = formatMeetingTime(time).split(' ');
  return (
    <span className={`cm-time cm-time--${tone}`}>
      <span className="cm-time__day">{day.slice(0, 3)}</span>
      <span className="cm-time__clock">{clock}</span>
      <span className="cm-time__period">{period}</span>
    </span>
  );
}

/**
 * "2 seats left of 4", with a bar showing how full the group is. Seats left
 * is what a student deciding whether to ask wants to know, so it leads.
 */
export function SeatMeter({ taken, max }: { taken: number; max: number }): ReactNode {
  const left = Math.max(0, max - taken);
  const percent = Math.min(100, Math.round((taken / max) * 100));
  return (
    <span className={left === 0 ? 'cm-seats cm-seats--full' : 'cm-seats'}>
      {left === 0 ? (
        <span>
          <strong>All {max} seats taken</strong>
        </span>
      ) : (
        <span>
          <strong>
            {left} {left === 1 ? 'seat' : 'seats'} left
          </strong>{' '}
          of {max}
        </span>
      )}
      <span className="cm-seats__bar" aria-hidden="true">
        <span className="cm-seats__fill" style={{ width: `${percent}%` }} />
      </span>
    </span>
  );
}

/** The viewer's own relationship to a group, if they have one. */
export function RelationshipChip({
  group,
}: {
  group: Pick<GroupSummary, 'viewerRole' | 'viewerRequestStatus'>;
}): ReactNode {
  if (group.viewerRole === 'leader') return <span className="cm-pill cm-pill--member">You lead</span>;
  if (group.viewerRole === 'member') return <span className="cm-pill cm-pill--member">You&rsquo;re in</span>;
  if (group.viewerRequestStatus === 'pending') return <span className="cm-pill cm-pill--requested">Requested</span>;
  return null;
}

export function StatusPill({ full }: { full: boolean }): ReactNode {
  return <span className={full ? 'cm-pill cm-pill--full' : 'cm-pill cm-pill--open'}>{full ? 'Full' : 'Open'}</span>;
}
