/**
 * The action panel on Group Details. It is the first thing in the page's
 * reading order (and first on a phone), holds at most one primary button,
 * and its wording follows the viewer's state: a stranger, someone waiting
 * for an answer, someone declined, a full group, a member, or the leader.
 */
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { GroupDetails, PendingJoinRequest } from '../api';
import { buildIcs, googleCalendarUrl, icsFileName, type CalendarEventInput } from '../calendar';
import { downloadTextFile } from '../download';
import { isGroupFull, meetingPlatform, seatsLeft } from '../groupFormat';
import { Avatar } from './Avatar';
import { AlertIcon, CalendarIcon, ChevronDownIcon, ExternalLinkIcon } from './icons';

function ActionError({ message }: { message: string | null }): ReactNode {
  if (message === null) return null;
  return (
    <div className="cm-notice cm-notice--error" role="alert">
      <AlertIcon />
      <span className="cm-notice__body">{message}</span>
    </div>
  );
}

function leaderName(group: GroupDetails): string {
  return group.members.find((member) => member.isLeader)?.name ?? 'The leader';
}

interface JoinPanelProps {
  group: GroupDetails;
  busy: boolean;
  error: string | null;
  onRequest: () => void;
  onWithdraw: () => void;
}

/** For a student who is not in the group. */
export function JoinPanel({ group, busy, error, onRequest, onWithdraw }: JoinPanelProps): ReactNode {
  const left = seatsLeft(group);

  if (group.viewerRequestStatus === 'pending') {
    return (
      <section className="cm-panel cm-action" aria-labelledby="join-heading">
        <h2 id="join-heading">Request sent</h2>
        <p className="cm-panel__text">
          {leaderName(group)} will accept or decline it. You will see the answer here.
        </p>
        <button type="button" className="cm-btn cm-btn--quiet cm-btn--sm" disabled={busy} onClick={onWithdraw}>
          Withdraw request
        </button>
        <ActionError message={error} />
      </section>
    );
  }

  if (isGroupFull(group)) {
    return (
      <section className="cm-panel cm-action" aria-labelledby="join-heading">
        <h2 id="join-heading">This group is full</h2>
        <p className="cm-panel__text">All {group.maxMembers} seats are taken, so it is not taking requests.</p>
        <Link to={`/groups/${group.courseId}`}>See other {group.courseCode} groups</Link>
      </section>
    );
  }

  const declined = group.viewerRequestStatus === 'declined';
  return (
    <section className="cm-panel cm-action" aria-labelledby="join-heading">
      <h2 id="join-heading" className="cm-action__headline">
        {left} {left === 1 ? 'seat' : 'seats'} left
      </h2>
      <p className="cm-panel__text">
        {declined
          ? `${leaderName(group)} declined your last request. You can ask again.`
          : 'Ask to join and the leader will accept or decline. You will see the answer here.'}
      </p>
      <button
        type="button"
        className={declined ? 'cm-btn cm-btn--secondary cm-btn--block' : 'cm-btn cm-btn--primary cm-btn--block'}
        disabled={busy}
        onClick={onRequest}
      >
        {declined ? 'Ask again' : 'Request to join'}
      </button>
      <ActionError message={error} />
    </section>
  );
}

function toCalendarEvent(group: GroupDetails): CalendarEventInput {
  return {
    groupId: group.id,
    courseCode: group.courseCode,
    goal: group.goal,
    meetingDay: group.meetingDay,
    meetingTime: group.meetingTime,
    format: group.format,
    // Only members see this panel, and members always get the location.
    location: group.location ?? '',
  };
}

/** Add to calendar, opening to Google Calendar or an .ics file. */
function CalendarOptions({ group }: { group: GroupDetails }): ReactNode {
  const [open, setOpen] = useState(false);
  const event = toCalendarEvent(group);
  return (
    <div className="cm-calendar">
      <button
        type="button"
        className="cm-btn cm-btn--secondary cm-btn--block"
        aria-expanded={open}
        aria-controls="calendar-options"
        onClick={() => setOpen((current) => !current)}
      >
        <CalendarIcon />
        Add to calendar
        <ChevronDownIcon />
      </button>
      <div id="calendar-options" className="cm-calendar__options" hidden={!open}>
        <a className="cm-btn cm-btn--quiet cm-btn--sm" href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer">
          Google Calendar
        </a>
        <button
          type="button"
          className="cm-btn cm-btn--quiet cm-btn--sm"
          onClick={() => downloadTextFile(icsFileName(event), buildIcs(event), 'text/calendar;charset=utf-8')}
        >
          Download .ics file
        </button>
        <p className="cm-hint">The event repeats every {group.meetingDay} and lasts one hour.</p>
      </div>
    </div>
  );
}

/** For members and the leader: how to get to the meeting, and the calendar. */
export function YourMeetingPanel({ group }: { group: GroupDetails }): ReactNode {
  const leader = group.viewerRole === 'leader';
  return (
    <section className="cm-panel cm-action" aria-labelledby="your-meeting-heading">
      <h2 id="your-meeting-heading">{leader ? 'Your meeting' : 'You are in this group'}</h2>
      {group.format === 'online' && group.location !== null ? (
        <>
          <a className="cm-btn cm-btn--primary cm-btn--block" href={group.location} target="_blank" rel="noopener noreferrer">
            Join meeting
            <ExternalLinkIcon />
          </a>
          <p className="cm-hint">Opens {meetingPlatform(group.location)} in a new tab.</p>
        </>
      ) : (
        <p className="cm-action__place">
          Meet at <strong>{group.location}</strong>
        </p>
      )}
      <CalendarOptions group={group} />
    </section>
  );
}

interface JoinRequestsPanelProps {
  requests: PendingJoinRequest[];
  busy: boolean;
  error: string | null;
  onDecide: (requestId: string, decision: 'approve' | 'decline') => void;
}

/** For the leader: who is waiting, each with Approve and Decline. */
export function JoinRequestsPanel({ requests, busy, error, onDecide }: JoinRequestsPanelProps): ReactNode {
  return (
    <section className="cm-panel cm-action" aria-labelledby="requests-heading">
      <h2 id="requests-heading">Join requests ({requests.length})</h2>
      {requests.length === 0 ? (
        <p className="cm-panel__text">No one is waiting to join.</p>
      ) : (
        <ul className="cm-requests">
          {requests.map((request) => (
            <li key={request.id} className="cm-request">
              <Avatar name={request.name} size={32} />
              <span className="cm-request__name">{request.name}</span>
              <button
                type="button"
                className="cm-btn cm-btn--secondary cm-btn--sm"
                disabled={busy}
                aria-label={`Approve ${request.name}`}
                onClick={() => onDecide(request.id, 'approve')}
              >
                Approve
              </button>
              <button
                type="button"
                className="cm-btn cm-btn--quiet cm-btn--sm"
                disabled={busy}
                aria-label={`Decline ${request.name}`}
                onClick={() => onDecide(request.id, 'decline')}
              >
                Decline
              </button>
            </li>
          ))}
        </ul>
      )}
      <ActionError message={error} />
    </section>
  );
}
