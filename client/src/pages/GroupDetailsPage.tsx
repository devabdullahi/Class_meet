import { useCallback, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, type GroupDetails, type JoinDecision } from '../api';
import { useAuth } from '../auth/useAuth';
import { MEETING_DURATION_MINUTES, nextOccurrence } from '../calendar';
import { Avatar } from '../components/Avatar';
import { ClassMeetLayout } from '../components/ClassMeetLayout';
import { JoinPanel, JoinRequestsPanel, YourMeetingPanel } from '../components/GroupActionPanels';
import { SeatCount, TimeTile } from '../components/groupParts';
import { AlertIcon, CheckCircleIcon, ChevronLeftIcon, PeopleIcon, PinIcon, VideoIcon } from '../components/icons';
import { groupGoalLine, groupTitle, isGroupFull, meetingPlatform } from '../groupFormat';
import { describeError, useApiData } from '../hooks/useApiData';
import { usePendingRequests } from '../pending-requests/usePendingRequests';

/**
 * A group without a name has its goal as the heading, which shows at most
 * three lines (of up to 500 characters). Past roughly this length it may be
 * cut, so the Meeting panel repeats it in full. A named group shows its goal
 * in full under the heading instead.
 */
const LONG_GOAL_LENGTH = 120;

function nextMeetingLabel(group: GroupDetails): string {
  const next = nextOccurrence(group.meetingDay, group.meetingTime, new Date());
  const date = next.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return `Next: ${date}`;
}

function MeetingPanel({ group }: { group: GroupDetails }): ReactNode {
  const durationHours = MEETING_DURATION_MINUTES / 60;
  return (
    <section className="cm-panel" aria-labelledby="meeting-heading">
      <h2 id="meeting-heading">Meeting</h2>
      {group.name === null && group.goal.length > LONG_GOAL_LENGTH && <p className="cm-goal">{group.goal}</p>}
      <div className="cm-info">
        <div className="cm-info__row">
          <TimeTile day={group.meetingDay} time={group.meetingTime} full={isGroupFull(group)} />
          {/* The tile already says the day and time, so this says what it does not. */}
          <div>
            <strong>
              Weekly · {durationHours} {durationHours === 1 ? 'hour' : 'hours'}
            </strong>
            <span className="cm-info__label">{nextMeetingLabel(group)} · your local time</span>
          </div>
        </div>
        <div className="cm-info__row">
          {group.format === 'online' ? <VideoIcon /> : <PinIcon />}
          <div>
            {group.format === 'online' ? (
              <>
                <strong>{group.location === null ? 'Online' : `Online · ${meetingPlatform(group.location)}`}</strong>
                <span className="cm-info__label">
                  {group.location === null
                    ? 'The meeting link is shared with members.'
                    : 'Use Join meeting to open the call.'}
                </span>
              </>
            ) : (
              <>
                <strong>{group.location}</strong>
                <span className="cm-info__label">In person</span>
              </>
            )}
          </div>
        </div>
        <div className="cm-info__row">
          <PeopleIcon />
          <SeatCount taken={group.memberCount} max={group.maxMembers} />
        </div>
      </div>
    </section>
  );
}

function MembersPanel({ group, viewerId }: { group: GroupDetails; viewerId: string | undefined }): ReactNode {
  return (
    <section className="cm-panel" aria-labelledby="members-heading">
      <h2 id="members-heading">
        Members · {group.memberCount} of {group.maxMembers}
      </h2>
      <ul className="cm-members">
        {group.members.map((member) => (
          <li key={member.userId}>
            <Avatar name={member.name} size={36} />
            <span>
              {member.name}
              {member.userId === viewerId && <span className="cm-members__you"> (you)</span>}
            </span>
            {member.isLeader && <span className="cm-tag">Leader</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function GroupDetailsPage(): ReactNode {
  const { courseId = '', groupId = '' } = useParams();
  const location = useLocation();
  const arrivedFrom = location.state as { created?: boolean; saved?: boolean } | null;
  const justCreated = arrivedFrom?.created === true;
  const justSaved = arrivedFrom?.saved === true;
  const { user } = useAuth();
  const { refresh: refreshPendingRequestCount } = usePendingRequests();
  const navigate = useNavigate();

  const { data, error, notFound, loading, reload } = useApiData(
    () => api.fetchGroup(groupId),
    [groupId],
    'We could not load this group. Please try again.',
  );
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [justLeft, setJustLeft] = useState(false);

  const loadedGroup = data?.group ?? null;
  // The address names the course as well, and the back links follow it, so a
  // group reached under another course's address is not shown there.
  const inWrongCourse = loadedGroup !== null && loadedGroup.courseId !== courseId;
  const group = inWrongCourse ? null : loadedGroup;
  const groupNotFound = notFound || inWrongCourse;

  async function runAction(action: () => Promise<unknown>): Promise<void> {
    setActionError(null);
    setJustLeft(false);
    setBusy(true);
    try {
      await action();
    } catch (failure) {
      setActionError(describeError(failure, 'That did not go through. Please try again.'));
    } finally {
      setBusy(false);
    }
    // Reloaded after a failure too: one usually means the group changed under
    // the student (it filled up, or the leader answered first), and the panel
    // should show the group as it is now, not the button that just failed.
    reload();
  }

  const requestToJoin = (): void => void runAction(() => api.requestToJoin(groupId));
  const withdrawRequest = (): void => void runAction(() => api.withdrawJoinRequest(groupId));
  // An answered request no longer waits, so the navigation badge counts again.
  const decide = (requestId: string, decision: JoinDecision): void =>
    void runAction(async () => {
      await api.decideJoinRequest(groupId, requestId, decision);
      refreshPendingRequestCount();
    });

  // The panel holding Leave group is gone once the student has left, so
  // the notice saying so takes focus.
  const leftNotice = useCallback((notice: HTMLDivElement | null) => notice?.focus(), []);
  async function leaveGroup(): Promise<void> {
    await api.leaveGroup(groupId);
    setJustLeft(true);
    reload();
  }

  // Replaces this page in the history, so Back does not return to a group
  // that no longer exists.
  async function deleteGroup(deleted: GroupDetails): Promise<void> {
    await api.deleteGroup(groupId);
    navigate(`/groups/${courseId}`, { replace: true, state: { deletedGroupTitle: groupTitle(deleted) } });
  }

  const leader = group?.members.find((member) => member.isLeader);
  const goalLine = group === null ? null : groupGoalLine(group);

  return (
    <ClassMeetLayout>
      <Link className="cm-back" to={`/groups/${courseId}`}>
        <ChevronLeftIcon />
        {group === null ? 'Back to study groups' : `Back to ${group.courseCode} groups`}
      </Link>

      {groupNotFound && (
        <div className="cm-empty">
          <h2>Group not found</h2>
          <p>This group may have been removed, or the link is incomplete.</p>
          <Link className="cm-btn cm-btn--secondary" to={`/groups/${courseId}`}>
            See this course&rsquo;s groups
          </Link>
        </div>
      )}

      {error !== null && !groupNotFound && (
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
          <header className="cm-details-header">
            <div className="cm-details-header__text">
              <h1>{groupTitle(group)}</h1>
              {goalLine !== null && <p className="cm-details-header__goal">{goalLine}</p>}
              <div className="cm-details-head">
                <span>
                  {group.courseCode} · {group.courseTitle}
                </span>
                {leader !== undefined && <span>Leader: {leader.name}</span>}
              </div>
            </div>
            {group.viewerRole === 'leader' && (
              <Link className="cm-btn cm-btn--secondary cm-btn--sm" to={`/groups/${courseId}/${groupId}/edit`}>
                Edit group
              </Link>
            )}
          </header>

          {justCreated && (
            <div className="cm-notice" role="status">
              <CheckCircleIcon />
              <span className="cm-notice__body">
                Group created. You lead it, so join requests will appear here for you to answer.
              </span>
            </div>
          )}

          {justLeft && group.viewerRole === 'none' && (
            <div ref={leftNotice} className="cm-notice" role="status" tabIndex={-1}>
              <CheckCircleIcon />
              <span className="cm-notice__body">You left this group.</span>
            </div>
          )}

          {justSaved && (
            <div className="cm-notice" role="status">
              <CheckCircleIcon />
              <span className="cm-notice__body">Changes saved.</span>
            </div>
          )}

          <div className="cm-details-grid">
            {/* First in reading order and on a phone: what you can do here. */}
            <div className="cm-stack cm-aside">
              {group.viewerRole === 'none' && (
                <JoinPanel
                  group={group}
                  busy={busy}
                  error={actionError}
                  onRequest={requestToJoin}
                  onWithdraw={withdrawRequest}
                />
              )}
              {group.viewerRole === 'leader' && (
                <JoinRequestsPanel
                  requests={group.pendingRequests}
                  busy={busy}
                  error={actionError}
                  onDecide={decide}
                />
              )}
              {group.viewerRole !== 'none' && (
                <YourMeetingPanel group={group} onLeave={leaveGroup} onDelete={() => deleteGroup(group)} />
              )}
            </div>

            <div className="cm-stack cm-details-main">
              <MeetingPanel group={group} />
              <MembersPanel group={group} viewerId={user?.id} />
            </div>
          </div>
        </>
      )}
    </ClassMeetLayout>
  );
}
