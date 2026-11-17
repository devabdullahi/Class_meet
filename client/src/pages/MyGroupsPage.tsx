/**
 * My groups: every group the student leads, belongs to or has asked to
 * join, across all their courses. What needs the student comes first: the
 * groups they lead, busiest with join requests at the top, then the groups
 * they are in, then their requests. Each card is one link to the group.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, type LedGroupSummary, type MyGroupSummary } from '../api';
import { ClassMeetLayout } from '../components/ClassMeetLayout';
import { SeatCount, TimeTile } from '../components/groupParts';
import { AlertIcon, PinIcon, PlusIcon, VideoIcon } from '../components/icons';
import { isGroupFull, meetingPlaceLabel, sortByNextMeeting } from '../groupFormat';
import { useApiData } from '../hooks/useApiData';

/** Most join requests first; groups with the same number, soonest meeting first. */
function sortLedGroups(groups: readonly LedGroupSummary[], now: Date): LedGroupSummary[] {
  return sortByNextMeeting(groups, now).sort((first, second) => second.pendingRequestCount - first.pendingRequestCount);
}

/** Pending requests before declined ones, each soonest meeting first. */
function sortRequests(groups: readonly MyGroupSummary[], now: Date): MyGroupSummary[] {
  const rank = (group: MyGroupSummary): number => (group.viewerRequestStatus === 'pending' ? 0 : 1);
  return sortByNextMeeting(groups, now).sort((first, second) => rank(first) - rank(second));
}

/** What the student needs to know about a group they lead: requests waiting, else how full it is. */
function LeaderFact({ group }: { group: LedGroupSummary }): ReactNode {
  const count = group.pendingRequestCount;
  if (count === 0) return <SeatCount taken={group.memberCount} max={group.maxMembers} />;
  return (
    <p className="cm-waiting">
      <strong className="cm-waiting__count">{count}</strong> {count === 1 ? 'request' : 'requests'} waiting
    </p>
  );
}

function MemberFact({ group }: { group: MyGroupSummary }): ReactNode {
  return (
    <p className="cm-group-card__place">
      {group.format === 'online' ? <VideoIcon /> : <PinIcon />}
      <span>{meetingPlaceLabel(group)}</span>
    </p>
  );
}

function RequestFact({ group }: { group: MyGroupSummary }): ReactNode {
  return group.viewerRequestStatus === 'declined' ? (
    <p className="cm-card__muted">
      <strong>Declined</strong> · you can ask again
    </p>
  ) : (
    <p className="cm-card__muted">
      <strong>Requested</strong> · waiting for the leader
    </p>
  );
}

/** The whole card is one link, named by the group's goal. */
function MyGroupCard({ group, children }: { group: MyGroupSummary; children: ReactNode }): ReactNode {
  return (
    <article className="cm-card">
      <div className="cm-group-card__top">
        <TimeTile day={group.meetingDay} time={group.meetingTime} full={isGroupFull(group)} />
        <div className="cm-my-group__heading">
          <span className="cm-code">{group.courseCode}</span>
          <h3 className="cm-card__title cm-group-card__title">
            <Link className="cm-card__link" to={`/groups/${group.courseId}/${group.id}`}>
              {group.goal}
            </Link>
          </h3>
        </div>
      </div>
      <div className="cm-card__foot">{children}</div>
    </article>
  );
}

function GroupSection({ id, title, count, children }: {
  id: string;
  title: string;
  count: number;
  children: ReactNode;
}): ReactNode {
  return (
    <section className="cm-section" aria-labelledby={id}>
      <h2 className="cm-section__title" id={id}>
        {title} <span className="cm-section__count">· {count}</span>
      </h2>
      <div className="cm-card-grid">{children}</div>
    </section>
  );
}

export function MyGroupsPage(): ReactNode {
  const { data, error, loading, reload } = useApiData(
    () => api.fetchMyGroups(),
    [],
    'We could not load your groups. Please try again.',
  );

  const now = new Date();
  const leading = sortLedGroups(data?.leading ?? [], now);
  const member = sortByNextMeeting(data?.member ?? [], now);
  const requested = sortRequests(data?.requested ?? [], now);
  const hasGroups = leading.length + member.length + requested.length > 0;

  return (
    <ClassMeetLayout>
      {/* No subtitle: the section headings below already say what each list is. */}
      <header className="cm-pagehead">
        <h1>My groups</h1>
      </header>

      {error !== null && (
        <div className="cm-notice cm-notice--error" role="alert">
          <AlertIcon />
          <span className="cm-notice__body">{error}</span>
          <button type="button" className="cm-btn cm-btn--quiet cm-btn--sm" onClick={reload}>
            Try again
          </button>
        </div>
      )}

      {loading && data === null && error === null && (
        <div className="cm-card-grid" aria-busy="true">
          <span className="cm-sr-only">Loading your groups</span>
          <div className="cm-skeleton" />
          <div className="cm-skeleton" />
        </div>
      )}

      {data !== null && !hasGroups && (
        <div className="cm-empty">
          <h2>No groups yet</h2>
          <p>Find a group in one of your courses and ask to join, or start your own.</p>
          <div className="cm-actions">
            <Link className="cm-btn cm-btn--primary" to="/">
              Find a group
            </Link>
            <Link className="cm-btn cm-btn--secondary" to="/groups/create">
              <PlusIcon />
              Create group
            </Link>
          </div>
        </div>
      )}

      {leading.length > 0 && (
        <GroupSection id="leading-heading" title="You lead" count={leading.length}>
          {leading.map((group) => (
            <MyGroupCard key={group.id} group={group}>
              <LeaderFact group={group} />
            </MyGroupCard>
          ))}
        </GroupSection>
      )}

      {member.length > 0 && (
        <GroupSection id="member-heading" title="You’re in" count={member.length}>
          {member.map((group) => (
            <MyGroupCard key={group.id} group={group}>
              <MemberFact group={group} />
            </MyGroupCard>
          ))}
        </GroupSection>
      )}

      {requested.length > 0 && (
        <GroupSection id="requested-heading" title="Your requests" count={requested.length}>
          {requested.map((group) => (
            <MyGroupCard key={group.id} group={group}>
              <RequestFact group={group} />
            </MyGroupCard>
          ))}
        </GroupSection>
      )}
    </ClassMeetLayout>
  );
}
