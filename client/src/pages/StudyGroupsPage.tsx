import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type GroupSummary } from '../api';
import { ClassMeetLayout } from '../components/ClassMeetLayout';
import { SeatMeter, StatusPill, TimeTile } from '../components/groupParts';
import { AlertIcon, ChevronLeftIcon, PinIcon, PlusIcon, VideoIcon } from '../components/icons';
import { formatLabel, isGroupFull } from '../groupFormat';
import { useApiData } from '../hooks/useApiData';

const ANY_DAY = 'Any Day';
const ANY_FORMAT = 'Any Format';
const ALL_GROUPS = 'All';
const DAY_FILTERS = [ANY_DAY, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function matchesFilters(group: GroupSummary, day: string, format: string, availability: string): boolean {
  const dayMatches = day === ANY_DAY || group.meetingDay === day;
  const formatMatches = format === ANY_FORMAT || formatLabel(group.format) === format;
  const availabilityMatches =
    availability === ALL_GROUPS || (availability === 'Full' ? isGroupFull(group) : !isGroupFull(group));
  return dayMatches && formatMatches && availabilityMatches;
}

export function StudyGroupsPage(): ReactNode {
  const { courseId = '' } = useParams();
  const { data, error, loading, reload } = useApiData(() => api.fetchCourseGroups(courseId), [courseId]);
  const [day, setDay] = useState(ANY_DAY);
  const [format, setFormat] = useState(ANY_FORMAT);
  const [availability, setAvailability] = useState(ALL_GROUPS);

  const groups = data?.groups ?? [];
  const visibleGroups = groups.filter((group) => matchesFilters(group, day, format, availability));
  const filtersActive = day !== ANY_DAY || format !== ANY_FORMAT || availability !== ALL_GROUPS;

  const clearFilters = (): void => {
    setDay(ANY_DAY);
    setFormat(ANY_FORMAT);
    setAvailability(ALL_GROUPS);
  };

  return (
    <ClassMeetLayout>
      <Link className="cm-back" to="/">
        <ChevronLeftIcon />
        Back to My Courses
      </Link>

      <header className="cm-pagehead">
        <div>
          <h1>{data === null ? 'Study Groups' : `${data.course.code} — Study Groups`}</h1>
          {data !== null && <p className="cm-pagehead__sub">{data.course.title}</p>}
        </div>
        <div className="cm-actions">
          <Link className="cm-btn cm-btn--primary" to={`/groups/create?course=${courseId}`}>
            <PlusIcon />
            Create Group
          </Link>
        </div>
      </header>

      <div className="cm-toolbar">
        <label className="cm-field">
          Day
          <select value={day} onChange={(event) => setDay(event.target.value)}>
            {DAY_FILTERS.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>

        <label className="cm-field">
          Format
          <select value={format} onChange={(event) => setFormat(event.target.value)}>
            <option>{ANY_FORMAT}</option>
            <option>Online</option>
            <option>In Person</option>
          </select>
        </label>

        <label className="cm-field">
          Availability
          <select value={availability} onChange={(event) => setAvailability(event.target.value)}>
            <option value={ALL_GROUPS}>All Groups</option>
            <option value="Open">Open</option>
            <option value="Full">Full</option>
          </select>
        </label>

        {filtersActive && (
          <button type="button" className="cm-btn cm-btn--quiet cm-btn--sm" onClick={clearFilters}>
            Clear filters
          </button>
        )}

        {data !== null && groups.length > 0 && (
          <p className="cm-toolbar__count" aria-live="polite">
            {visibleGroups.length} of {groups.length} {groups.length === 1 ? 'group' : 'groups'}
          </p>
        )}
      </div>

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
          <span className="cm-sr-only">Loading study groups</span>
          <div className="cm-skeleton" />
          <div className="cm-skeleton" />
          <div className="cm-skeleton" />
        </div>
      )}

      {data !== null && groups.length === 0 && (
        <div className="cm-empty">
          <h2>No study groups yet</h2>
          <p>No study groups yet for this course. Start the first one and others can ask to join.</p>
          <Link className="cm-btn cm-btn--primary" to={`/groups/create?course=${courseId}`}>
            Create the first group
          </Link>
        </div>
      )}

      {groups.length > 0 && visibleGroups.length === 0 && (
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
          {visibleGroups.map((group) => {
            const full = isGroupFull(group);
            return (
              <article className="cm-card" key={group.id}>
                <div className="cm-group__top">
                  <TimeTile day={group.meetingDay} time={group.meetingTime} muted={full} />
                  <h2 className="cm-card__title">{group.goal}</h2>
                </div>
                <ul className="cm-meta">
                  <li>
                    {group.format === 'online' ? <VideoIcon /> : <PinIcon />}
                    <span>{group.format === 'online' ? 'Online meeting' : group.location}</span>
                  </li>
                  <li>
                    <SeatMeter taken={group.memberCount} max={group.maxMembers} />
                  </li>
                </ul>
                <div className="cm-card__foot">
                  <StatusPill full={full} />
                  <Link className="cm-btn cm-btn--secondary cm-btn--sm" to={`/groups/${courseId}/${group.id}`}>
                    View group
                  </Link>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </ClassMeetLayout>
  );
}
