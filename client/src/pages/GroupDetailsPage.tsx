import { useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, type GroupDetails, type JoinDecision } from '../api';
import { buildIcs, googleCalendarUrl, icsFileName, type CalendarEventInput } from '../calendar';
import { ClassMeetLayout } from '../components/ClassMeetLayout';
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

  return (
    <ClassMeetLayout mainClassName="cm-details">
      <Link to={`/groups/${courseId}`}>← Back to Study Groups</Link>

      {loading && group === null && <p className="cm-note">Loading group…</p>}
      {error !== null && (
        <p className="cm-error" role="alert">
          {error}
        </p>
      )}

      {group !== null && (
        <>
          {justCreated && (
            <p className="cm-success" role="status">
              Your group was created. You are its leader.
            </p>
          )}

          <p>
            {group.courseCode} · {isGroupFull(group) ? 'Full' : 'Open'}
          </p>
          <h1>{group.goal}</h1>
          <p>{group.courseTitle}</p>

          <section className="cm-card">
            <h2>Study Information</h2>
            <p>
              <strong>Meets:</strong> every {group.meetingDay}
            </p>
            <p>
              <strong>Time:</strong> {formatMeetingTime(group.meetingTime)}
            </p>
            <p>
              <strong>Location:</strong>{' '}
              {group.format === 'online' ? (
                <a href={group.location} target="_blank" rel="noopener noreferrer">
                  {group.location}
                </a>
              ) : (
                group.location
              )}{' '}
              ({formatLabel(group.format)})
            </p>
            <p>
              <strong>Group size:</strong> {group.memberCount} / {group.maxMembers} members
            </p>
          </section>

          <section className="cm-card">
            <h2>Current Members</h2>
            {group.members.map((member) => (
              <p key={member.userId}>
                {member.name}
                {member.isLeader ? ' — Group Leader' : ''}
              </p>
            ))}
          </section>

          {group.viewerRole === 'leader' && (
            <section className="cm-card">
              <h2>Join Requests</h2>
              {group.pendingRequests.length === 0 && <p>No one is waiting to join.</p>}
              {group.pendingRequests.map((request) => (
                <div className="cm-request" key={request.id}>
                  <span>{request.name}</span>
                  <span className="cm-request__actions">
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Approve ${request.name}`}
                      onClick={() => void decide(request.id, 'approve')}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="cm-button--quiet"
                      disabled={busy}
                      aria-label={`Decline ${request.name}`}
                      onClick={() => void decide(request.id, 'decline')}
                    >
                      Decline
                    </button>
                  </span>
                </div>
              ))}
            </section>
          )}

          {group.viewerRole === 'none' && (
            <section className="cm-card">
              <h2>Ready to join?</h2>
              {group.viewerRequestStatus === 'pending' && <p>Request pending. The group leader will answer it.</p>}
              {group.viewerRequestStatus === 'declined' && (
                <p>Your last request was declined. You can ask again.</p>
              )}
              {group.viewerRequestStatus === null && <p>Request to join this study group.</p>}
              {group.viewerRequestStatus !== 'pending' && (
                <button type="button" disabled={busy || isGroupFull(group)} onClick={() => void requestToJoin()}>
                  {isGroupFull(group)
                    ? 'Group Full'
                    : group.viewerRequestStatus === 'declined'
                      ? 'Ask Again'
                      : 'Request to Join'}
                </button>
              )}
            </section>
          )}

          {group.viewerRole !== 'none' && (
            <section className="cm-card">
              <h2>Add to your calendar</h2>
              <p>
                {group.viewerRole === 'leader' ? 'You lead this group.' : 'You are in this group.'} The event
                repeats every {group.meetingDay} and lasts one hour.
              </p>
              <div className="cm-request__actions">
                <button
                  type="button"
                  onClick={() => {
                    const event = toCalendarEvent(group);
                    downloadTextFile(icsFileName(event), buildIcs(event), 'text/calendar;charset=utf-8');
                  }}
                >
                  Download .ics
                </button>
                <a
                  className="cm-link-button"
                  href={googleCalendarUrl(toCalendarEvent(group))}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Add to Google Calendar
                </a>
              </div>
            </section>
          )}

          {actionError !== null && (
            <p className="cm-error" role="alert">
              {actionError}
            </p>
          )}
        </>
      )}
    </ClassMeetLayout>
  );
}
