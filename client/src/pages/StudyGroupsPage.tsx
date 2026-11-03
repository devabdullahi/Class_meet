import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type GroupSummary } from '../api';
import { ClassMeetLayout } from '../components/ClassMeetLayout';
import { formatLabel, formatMeetingTime, isGroupFull } from '../groupFormat';
import { useApiData } from '../hooks/useApiData';

const DAY_FILTERS = ['Any Day', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function matchesFilters(group: GroupSummary, day: string, format: string, availability: string): boolean {
  const dayMatches = day === 'Any Day' || group.meetingDay === day;
  const formatMatches = format === 'Any Format' || formatLabel(group.format) === format;
  const availabilityMatches =
    availability === 'All' ||
    (availability === 'Full' ? isGroupFull(group) : !isGroupFull(group));
  return dayMatches && formatMatches && availabilityMatches;
}

export function StudyGroupsPage(): ReactNode {
  const { courseId = '' } = useParams();
  const { data, error, loading } = useApiData(() => api.fetchCourseGroups(courseId), [courseId]);
  const [day, setDay] = useState('Any Day');
  const [format, setFormat] = useState('Any Format');
  const [availability, setAvailability] = useState('All');

  const visibleGroups = (data?.groups ?? []).filter((group) =>
    matchesFilters(group, day, format, availability),
  );

  return (
    <ClassMeetLayout>
      <Link to="/">← Back to My Courses</Link>

      <header className="cm-header cm-header--actions">
        <div>
          <h1>{data === null ? 'Study Groups' : `${data.course.code} — Study Groups`}</h1>
          {data !== null && <p>{data.course.title}</p>}
        </div>
        <div className="cm-actions">
          <Link className="cm-button" to={`/groups/create?course=${courseId}`}>
            Create Group
          </Link>
        </div>
      </header>

      <div className="cm-filters">
        <select aria-label="Day" value={day} onChange={(event) => setDay(event.target.value)}>
          {DAY_FILTERS.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>

        <select aria-label="Format" value={format} onChange={(event) => setFormat(event.target.value)}>
          <option>Any Format</option>
          <option>Online</option>
          <option>In Person</option>
        </select>

        <select
          aria-label="Availability"
          value={availability}
          onChange={(event) => setAvailability(event.target.value)}
        >
          <option value="All">All Groups</option>
          <option value="Open">Open</option>
          <option value="Full">Full</option>
        </select>
      </div>

      {loading && data === null && <p className="cm-note">Loading study groups…</p>}
      {error !== null && (
        <p className="cm-error" role="alert">
          {error}
        </p>
      )}
      {data !== null && data.groups.length === 0 && (
        <p className="cm-note">No study groups yet for this course. Create the first one.</p>
      )}
      {data !== null && data.groups.length > 0 && visibleGroups.length === 0 && (
        <p className="cm-note">No groups match these filters.</p>
      )}

      <section className="cm-courses" aria-label="Study groups">
        {visibleGroups.map((group) => {
          const full = isGroupFull(group);
          return (
            <article className="cm-course-card" key={group.id}>
              <span>{full ? 'Full' : 'Open'}</span>
              <h2>{group.goal}</h2>
              <p>
                {group.meetingDay} · {formatMeetingTime(group.meetingTime)}
              </p>
              <p>
                {group.format === 'online' ? 'Online' : group.location} ({formatLabel(group.format)})
              </p>
              <p>
                Members: {group.memberCount}/{group.maxMembers}
              </p>
              <Link to={`/groups/${courseId}/${group.id}`}>{full ? 'View Group (full) →' : 'View Group →'}</Link>
            </article>
          );
        })}
      </section>
    </ClassMeetLayout>
  );
}
