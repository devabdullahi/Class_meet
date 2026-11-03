import { useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, type GroupDetails, type JoinDecision } from '../api';
import { buildIcs, googleCalendarUrl, icsFileName, type CalendarEventInput } from '../calendar';
import { Avatar } from '../components/Avatar';
import { ClassMeetLayout } from '../components/ClassMeetLayout';
import { SeatMeter, StatusPill, TimeTile } from '../components/groupParts';
import { AlertIcon, CalendarIcon, CheckCircleIcon, ChevronLeftIcon, PeopleIcon, PinIcon, VideoIcon } from '../components/icons';
import { downloadTextFile } from '../download';
import { formatLabel, formatMeetingTime, isGroupFull } from '../groupFormat';
import { describeError, useApiData } from '../hooks/useApiData';

function toCalendarEvent(group: GroupDetails): CalendarEventInput {
  return {
    groupId: group.id,
    courseCode: group.courseCode,
    goal: group.goal,
    meetingDay: group.meetingDay,
    meetingTime: group.meetingTime,
    format: group.format,
    location: group.location,
  };
}

/** The host of a meeting link, so the page says where it leads. */
function linkHost(link: string): string {
  try {
    return new URL(link).hostname;
  } catch {
    return link;
  }
}

export function GroupDetailsPage(): ReactNode {
  const { courseId = '', groupId = '' } = useParams();
  const location = useLocation();
  const justCreated = (location.state as { created?: boolean } | null)?.created === true;

  const { data, error, loading, reload } = useApiData(() => api.fetchGroup(groupId), [groupId]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const group = data?.group ?? null;

  async function runAction(action: () => Promise<unknown>): Promise<void> {
    setActionError(null);
    setBusy(true);
    try {
      await action();
      reload();
    } catch (failure) {
      setActionError(describeError(failure));
    } finally {
      setBusy(false);
    }
  }

  const requestToJoin = (): Promise<void> => runAction(() => api.requestToJoin(groupId));
  const decide = (requestId: string, decision: JoinDecision): Promise<void> =>
    runAction(() => api.decideJoinRequest(groupId, requestId, decision));

  const full = group !== null && isGroupFull(group);

  return (
    <ClassMeetLayout>
      <Link className="cm-back" to={`/groups/${courseId}`}>
        <ChevronLeftIcon />
        Back to Study Groups
      </Link>

      {error !== null && (
        <div className="cm-notice cm-notice--error" role="alert">
          <AlertIcon />
          <span className="cm-notice__body">{error}</span>
          <button type="button" className="cm-btn cm-btn--quiet cm-btn--sm" onClick={reload}>
            Try again
          </button>
        </div>
      )}

      {loading && group === null && error === null && (
        <div aria-busy="true">
          <span className="cm-sr-only">Loading group</span>
          <div className="cm-skeleton" />
        </div>
      )}

      {group !== null && (
        <>
          <header className="cm-pagehead">
            <div>
              <h1>{group.goal}</h1>
              <div className="cm-details-head">
                <StatusPill full={full} />
                <span>
                  {group.courseCode} &mdash; {group.courseTitle}
                </span>
              </div>
            </div>
          </header>

          {justCreated && (
            <div className="cm-notice cm-notice--success" role="status">
              <CheckCircleIcon />
              <span className="cm-notice__body">
                Group created. You are its leader. Add the weekly meeting to your calendar from the panel on the
                right.
              </span>
            </div>
          )}

          <div className="cm-details-grid">
            <div className="cm-stack">
              <section className="cm-panel" aria-labelledby="meeting-heading">
                <h2 id="meeting-heading">Meeting</h2>
                <div className="cm-info">
                  <div className="cm-info__row">
                    <TimeTile day={group.meetingDay} time={group.meetingTime} muted={full} />
                    <div>
                      <strong>
                        Every {group.meetingDay} at {formatMeetingTime(group.meetingTime)}
                      </strong>
                      <span className="cm-info__label">Weekly, in your local time</span>
                    </div>
                  </div>
                  <div className="cm-info__row">
                    {group.format === 'online' ? <VideoIcon /> : <PinIcon />}
                    <div>
                      {group.format === 'online' ? (
                        <a href={group.location} target="_blank" rel="noopener noreferrer">
                          Open meeting link
                        </a>
                      ) : (
                        <strong>{group.location}</strong>
                      )}
                      <span className="cm-info__label">
                        {formatLabel(group.format)}
                        {group.format === 'online' ? ` · ${linkHost(group.location)}` : ''}
                      </span>
                    </div>
                  </div>
                  <div className="cm-info__row">
                    <PeopleIcon />
                    <SeatMeter taken={group.memberCount} max={group.maxMembers} />
                  </div>
                </div>
              </section>

              <section className="cm-panel" aria-labelledby="members-heading">
                <h2 id="members-heading">Members</h2>
                <ul className="cm-members">
                  {group.members.map((member) => (
                    <li key={member.userId}>
                      <Avatar name={member.name} size={36} />
                      <span>{member.name}</span>
                      {member.isLeader && <span className="cm-pill cm-pill--leader">Leader</span>}
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <div className="cm-stack cm-aside">
              {group.viewerRole === 'none' && (
                <section className="cm-panel" aria-labelledby="join-heading">
                  <h2 id="join-heading">Ready to join?</h2>
                  <p className="cm-panel__text">
                    {group.viewerRequestStatus === 'pending'
                      ? 'Request pending. The group leader will answer it.'
                      : group.viewerRequestStatus === 'declined'
                        ? 'Your last request was declined. You can ask again.'
                        : 'Ask the group leader for a seat. You will see their answer here.'}
                  </p>
                  {group.viewerRequestStatus !== 'pending' && (
                    <button
                      type="button"
                      className="cm-btn cm-btn--primary cm-btn--block"
                      disabled={busy || full}
                      onClick={() => void requestToJoin()}
                      style={{ marginTop: 14 }}
                    >
                      {full ? 'Group Full' : group.viewerRequestStatus === 'declined' ? 'Ask Again' : 'Request to Join'}
                    </button>
                  )}
                </section>
              )}

              {group.viewerRole === 'leader' && (
                <section className="cm-panel" aria-labelledby="requests-heading">
                  <h2 id="requests-heading">Join Requests</h2>
                  {group.pendingRequests.length === 0 && <p className="cm-panel__text">No one is waiting to join.</p>}
                  {group.pendingRequests.map((request) => (
                    <div className="cm-request" key={request.id}>
                      <div className="cm-request__who">
                        <Avatar name={request.name} size={36} />
                        <span>{request.name}</span>
                      </div>
                      <div className="cm-row">
                        <button
                          type="button"
                          className="cm-btn cm-btn--primary cm-btn--sm"
                          disabled={busy}
                          aria-label={`Approve ${request.name}`}
                          onClick={() => void decide(request.id, 'approve')}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="cm-btn cm-btn--quiet cm-btn--sm"
                          disabled={busy}
                          aria-label={`Decline ${request.name}`}
                          onClick={() => void decide(request.id, 'decline')}
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </section>
              )}

              {group.viewerRole !== 'none' && (
                <section className="cm-panel" aria-labelledby="calendar-heading">
                  <h2 id="calendar-heading">Add to your calendar</h2>
                  <p className="cm-panel__text" style={{ marginBottom: 14 }}>
                    {group.viewerRole === 'leader' ? 'You lead this group.' : 'You are in this group.'} The event
                    repeats every {group.meetingDay} and lasts one hour.
                  </p>
                  <div className="cm-calendar">
                    <a
                      className="cm-btn cm-btn--primary"
                      href={googleCalendarUrl(toCalendarEvent(group))}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <CalendarIcon />
                      Add to Google Calendar
                    </a>
                    <button
                      type="button"
                      className="cm-btn cm-btn--secondary"
                      onClick={() => {
                        const event = toCalendarEvent(group);
                        downloadTextFile(icsFileName(event), buildIcs(event), 'text/calendar;charset=utf-8');
                      }}
                    >
                      Download .ics
                    </button>
                  </div>
                </section>
              )}

              {actionError !== null && (
                <div className="cm-notice cm-notice--error" role="alert" style={{ marginTop: 0 }}>
                  <AlertIcon />
                  <span className="cm-notice__body">{actionError}</span>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </ClassMeetLayout>
  );
}
