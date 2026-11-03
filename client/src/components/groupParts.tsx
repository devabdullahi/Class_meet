/**
 * Small pieces shared by the Study Groups and Group Details screens, so a
 * meeting time, a seat count and an Open/Full label look the same everywhere.
 */
import type { ReactNode } from 'react';
import type { MeetingDay } from '../api';
import { formatMeetingTime } from '../groupFormat';

/**
 * When the group meets, as a tile: the weekday above the clock time. It is the
 * one orange element in the app, and it turns slate when the group is full, so
 * a scan down the list shows which meetings can still be joined.
 */
export function TimeTile({
  day,
  time,
  muted = false,
}: {
  day: MeetingDay;
  time: string;
  muted?: boolean;
}): ReactNode {
  const [clock = '', period = ''] = formatMeetingTime(time).split(' ');
  return (
    <span className={muted ? 'cm-time cm-time--muted' : 'cm-time'}>
      <span className="cm-time__day">{day.slice(0, 3)}</span>
      <span className="cm-time__clock">{clock}</span>
      <span className="cm-time__period">{period}</span>
    </span>
  );
}

/** "2 of 6 seats filled" with a bar that shows the same thing at a glance. */
export function SeatMeter({ taken, max }: { taken: number; max: number }): ReactNode {
  const percent = Math.min(100, Math.round((taken / max) * 100));
  return (
    <span className="cm-seats">
      <span>
        {taken} of {max} seats filled
      </span>
      <span className="cm-seats__bar" aria-hidden="true">
        <span className="cm-seats__fill" style={{ width: `${percent}%` }} />
      </span>
    </span>
  );
}

export function StatusPill({ full }: { full: boolean }): ReactNode {
  return <span className={full ? 'cm-pill cm-pill--full' : 'cm-pill cm-pill--open'}>{full ? 'Full' : 'Open'}</span>;
}
