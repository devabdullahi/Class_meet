/**
 * The action panel on Group Details. It is the first thing in the page's
 * reading order (and first on a phone), holds at most one primary button,
 * and its wording follows the viewer's state: a stranger, someone waiting
 * for an answer, someone declined, a full group, a member, or the leader.
 */
import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, type GroupDetails, type PendingJoinRequest } from '../api';
import { buildIcs, googleCalendarUrl, icsFileName, type CalendarEventInput } from '../calendar';
import { chatPlatform } from '../chatLink';
import { downloadTextFile } from '../download';
import { isGroupFull, meetingPlatform, seatsLeft } from '../groupFormat';
import { useApiData } from '../hooks/useApiData';
import { InlineConfirm } from './InlineConfirm';
import { RequesterProfile } from './RequesterProfile';
import { AlertIcon, CalendarIcon, ChatIcon, ChevronDownIcon, ExternalLinkIcon } from './icons';

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

/**
 * Under Request to join, for a student with no profile: the leader would see
 * only their name. Saving the profile brings them back to this group. If
 * the profile cannot be loaded the note is simply left out; it is advice,
 * and the request works the same either way.
 */
function AddProfileNote(): ReactNode {
  const { pathname } = useLocation();
  const { data } = useApiData(() => api.fetchProfile(), []);
  if (data === null || data.profile !== null) return null;
  return (
    <p className="cm-hint">
      The leader will see only your name.{' '}
      <Link to="/profile" state={{ returnTo: pathname }}>
        Add a profile
      </Link>{' '}
      so they know your major and how you study.
    </p>
  );
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
      <AddProfileNote />
      <ActionError message={error} />
    </section>
  );
}

function toCalendarEvent(group: GroupDetails): CalendarEventInput {
  return {
    groupId: group.id,
    courseCode: group.courseCode,
    name: group.name,
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

/** The panel's primary action when the group has a chat: the chat is where members talk between meetings. */
function OpenGroupChat({ link }: { link: string }): ReactNode {
  const platform = chatPlatform(link);
  return (
    <>
      <a className="cm-btn cm-btn--primary cm-btn--block" href={link} target="_blank" rel="noopener noreferrer">
        <ChatIcon />
        Open group chat
        <ExternalLinkIcon />
      </a>
      <p className="cm-hint">
        Opens {platform === null ? 'the group chat' : `the group’s ${platform}`} in a new tab. Only members see
        this link.
      </p>
    </>
  );
}

interface YourMeetingPanelProps {
  group: GroupDetails;
  /** Members only; the leader cannot leave the group they lead. */
  onLeave: () => Promise<void>;
  /** The leader only. */
  onDelete: () => Promise<void>;
}

/**
 * For members and the leader: how to get to the meeting, the group chat when
 * there is one, the calendar, and a way out: Leave group for a member, Delete
 * group for the leader (who cannot leave, and needs this to ever remove the
 * course). The panel keeps one primary button: Open group chat when the group
 * has a chat, otherwise Join meeting for an online group.
 */
export function YourMeetingPanel({ group, onLeave, onDelete }: YourMeetingPanelProps): ReactNode {
  const leader = group.viewerRole === 'leader';
  const hasChat = group.chatLink !== null;
  return (
    <section className="cm-panel cm-action" aria-labelledby="your-meeting-heading">
      <h2 id="your-meeting-heading">{leader ? 'Your meeting' : 'You are in this group'}</h2>
      {group.format === 'online' && group.location !== null ? (
        <>
          <a
            className={hasChat ? 'cm-btn cm-btn--secondary cm-btn--block' : 'cm-btn cm-btn--primary cm-btn--block'}
            href={group.location}
            target="_blank"
            rel="noopener noreferrer"
          >
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
      {group.chatLink !== null && <OpenGroupChat link={group.chatLink} />}
      <CalendarOptions group={group} />
      {leader ? (
        <InlineConfirm
          label="Delete group"
          busyLabel="Deleting…"
          question="Delete this group?"
          consequence="Its members lose their seats and waiting requests are dropped. This cannot be undone."
          failureMessage="We could not delete the group. Please try again."
          onConfirm={onDelete}
        />
      ) : (
        <InlineConfirm
          label="Leave group"
          busyLabel="Leaving…"
          question="Leave this group?"
          consequence="Your seat goes to someone else. To come back, you would ask to join again."
          failureMessage="We could not take you out of the group. Please try again."
          onConfirm={onLeave}
        />
      )}
    </section>
  );
}

interface JoinRequestsPanelProps {
  requests: PendingJoinRequest[];
  busy: boolean;
  error: string | null;
  onDecide: (requestId: string, decision: 'approve' | 'decline') => void;
}

/** For the leader: who is waiting, with what their profile says, each with Approve and Decline. */
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
              <RequesterProfile name={request.name} profile={request.profile} />
              <div className="cm-request__actions">
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
              </div>
            </li>
          ))}
        </ul>
      )}
      <ActionError message={error} />
    </section>
  );
}
