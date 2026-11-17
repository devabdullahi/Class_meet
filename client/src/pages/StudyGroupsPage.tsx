import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type GroupSummary } from '../api';
import { ClassMeetLayout } from '../components/ClassMeetLayout';
import { RelationshipLabel, SeatCount, TimeTile } from '../components/groupParts';
import { AlertIcon, ChevronLeftIcon, PinIcon, PlusIcon, VideoIcon } from '../components/icons';
import { formatLabel, isGroupFull, meetingPlatform, sortByNextMeeting } from '../groupFormat';
import { useApiData } from '../hooks/useApiData';

const ANY_DAY = 'Any day';
const ANY_FORMAT = 'Any format';
const ALL_GROUPS = 'All';
const DAY_FILTERS = [ANY_DAY, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function matchesFilters(group: GroupSummary, day: string, format: string, availability: string): boolean {
  const dayMatches = day === ANY_DAY || group.meetingDay === day;
  const formatMatches = format === ANY_FORMAT || formatLabel(group.format) === format;
  const availabilityMatches =
    availability === ALL_GROUPS || (availability === 'Full' ? isGroupFull(group) : !isGroupFull(group));
  return dayMatches && formatMatches && availabilityMatches;
}

/** Where the group meets: the place, or the platform for an online group when you may see its link. */
function placeLabel(group: GroupSummary): string {
  if (group.format === 'in_person') return group.location ?? '';
  return group.location === null ? 'Online' : `Online · ${meetingPlatform(group.location)}`;
}

/** The whole card is one link, named by the group's goal. */
function GroupCard({ group, courseId }: { group: GroupSummary; courseId: string }): ReactNode {
  return (
    <article className="cm-card cm-group-card">
      <div className="cm-group-card__top">
        <TimeTile day={group.meetingDay} time={group.meetingTime} full={isGroupFull(group)} />
        <h2 className="cm-card__title cm-group-card__title">
          <Link className="cm-card__link" to={`/groups/${courseId}/${group.id}`}>
            {group.goal}
          </Link>
        </h2>
      </div>
      <p className="cm-group-card__place">
        {group.format === 'online' ? <VideoIcon /> : <PinIcon />}
        <span>{placeLabel(group)}</span>
      </p>
      <div className="cm-group-card__foot">
        <SeatCount taken={group.memberCount} max={group.maxMembers} />
        <RelationshipLabel group={group} />
      </div>
    </article>
  );
}

export function StudyGroupsPage(): ReactNode {
  const { courseId = '' } = useParams();
  const { data, error, notFound, loading, reload } = useApiData(
    () => api.fetchCourseGroups(courseId),
    [courseId],
    'We could not load the study groups for this course. Please try again.',
  );
  const [day, setDay] = useState(ANY_DAY);
  const [format, setFormat] = useState(ANY_FORMAT);
  const [availability, setAvailability] = useState(ALL_GROUPS);

  const groups = sortByNextMeeting(data?.groups ?? [], new Date());
  const visibleGroups = groups.filter((group) => matchesFilters(group, day, format, availability));
  const filtersActive = day !== ANY_DAY || format !== ANY_FORMAT || availability !== ALL_GROUPS;
  const hasGroups = groups.length > 0;
  const createGroupPath = `/groups/create?course=${courseId}`;

  const clearFilters = (): void => {
    setDay(ANY_DAY);
    setFormat(ANY_FORMAT);
    setAvailability(ALL_GROUPS);
  };

  return (
    <ClassMeetLayout>
      <Link className="cm-back" to="/">
        <ChevronLeftIcon />
        Back to my courses
      </Link>

      <header className="cm-pagehead">
        <div>
          <h1>{data === null ? 'Study groups' : `${data.course.code} study groups`}</h1>
          {data !== null && <p className="cm-pagehead__sub">{data.course.title}</p>}
        </div>
        {/* With no groups yet, the empty state below holds this action instead. */}
        {hasGroups && (
          <div className="cm-actions">
            <Link className="cm-btn cm-btn--primary" to={createGroupPath}>
              <PlusIcon />
              Create group
            </Link>
          </div>
        )}
      </header>

      {hasGroups && (
        <div className="cm-toolbar">
          <label className="cm-field">
            <span className="cm-field__label">Day</span>
            <select className="cm-input" value={day} onChange={(event) => setDay(event.target.value)}>
              {DAY_FILTERS.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>

          <label className="cm-field">
            <span className="cm-field__label">Format</span>
            <select className="cm-input" value={format} onChange={(event) => setFormat(event.target.value)}>
              <option>{ANY_FORMAT}</option>
              <option>Online</option>
              <option>In person</option>
            </select>
          </label>

          <label className="cm-field">
            <span className="cm-field__label">Availability</span>
            <select
              className="cm-input"
              value={availability}
              onChange={(event) => setAvailability(event.target.value)}
            >
              <option value={ALL_GROUPS}>All groups</option>
              <option value="Open">Open</option>
              <option value="Full">Full</option>
            </select>
          </label>

          {filtersActive && (
            <button type="button" className="cm-btn cm-btn--quiet cm-btn--sm" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {hasGroups && (
        <p className="cm-toolbar__count" aria-live="polite">
          {visibleGroups.length} of {groups.length} {groups.length === 1 ? 'group' : 'groups'}, soonest first
        </p>
      )}

      {notFound && (
        <div className="cm-empty">
          <h2>Course not found</h2>
          <p>This course does not exist, or the link is incomplete. Your courses are on My courses.</p>
          <Link className="cm-btn cm-btn--secondary" to="/">
            Go to my courses
          </Link>
        </div>
      )}

      {error !== null && !notFound && (
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
          <span className="cm-sr-only">Loading study groups</span>
          <div className="cm-skeleton" />
          <div className="cm-skeleton" />
          <div className="cm-skeleton" />
        </div>
      )}

      {data !== null && !hasGroups && (
        <div className="cm-empty">
          <h2>No study groups yet</h2>
          <p>No one has started a group for {data.course.code}. Start the first one and others can ask to join.</p>
          <Link className="cm-btn cm-btn--primary" to={createGroupPath}>
            <PlusIcon />
            Create the first group
          </Link>
        </div>
      )}

      {hasGroups && visibleGroups.length === 0 && (
        <div className="cm-empty">
          <h2>No groups match these filters</h2>
          <p>Try a different day or format, or clear the filters to see every group.</p>
          <button type="button" className="cm-btn cm-btn--secondary" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      )}

      {visibleGroups.length > 0 && (
        <section className="cm-card-grid" aria-label="Study groups">
          {visibleGroups.map((group) => (
            <GroupCard key={group.id} group={group} courseId={courseId} />
          ))}
        </section>
      )}
    </ClassMeetLayout>
  );
}
