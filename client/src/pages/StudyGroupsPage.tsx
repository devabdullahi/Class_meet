import { useCallback, useRef, useState, type ReactNode, type Ref } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, type Course, type GroupSummary } from '../api';
import { ClassMeetLayout } from '../components/ClassMeetLayout';
import { CopyLinkField } from '../components/CopyLinkField';
import { RelationshipLabel, SeatCount, TimeTile } from '../components/groupParts';
import {
  AlertIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  LinkIcon,
  PinIcon,
  PlusIcon,
  VideoIcon,
} from '../components/icons';
import { ShareCourseLinkDialog } from '../components/ShareCourseLinkDialog';
import { courseLinkUrl, type CourseLinkOutcome } from '../courseLink';
import {
  formatLabel,
  groupGoalLine,
  groupTitle,
  isGroupFull,
  meetingPlaceLabel,
  sortByNextMeeting,
} from '../groupFormat';
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

/** The whole card is one link, named by the group's title. */
function GroupCard({ group, courseId }: { group: GroupSummary; courseId: string }): ReactNode {
  const goalLine = groupGoalLine(group);
  return (
    <article className="cm-card cm-group-card">
      <div className="cm-group-card__top">
        <TimeTile day={group.meetingDay} time={group.meetingTime} full={isGroupFull(group)} />
        <div className="cm-group-card__heading">
          <h2 className="cm-card__title cm-group-card__title">
            <Link className="cm-card__link" to={`/groups/${courseId}/${group.id}`}>
              {groupTitle(group)}
            </Link>
          </h2>
          {goalLine !== null && <p className="cm-group-card__goal">{goalLine}</p>}
        </div>
      </div>
      <p className="cm-group-card__place">
        {group.format === 'online' ? <VideoIcon /> : <PinIcon />}
        <span>{meetingPlaceLabel(group)}</span>
      </p>
      <div className="cm-group-card__foot">
        <SeatCount taken={group.memberCount} max={group.maxMembers} />
        <RelationshipLabel group={group} />
      </div>
    </article>
  );
}

interface StudyGroupsLocationState {
  /** Set by Group Details after its leader deletes the group. */
  deletedGroupTitle?: string;
  /** Set by the course link page (JoinCoursePage) when it sends the student here. */
  courseLinkOutcome?: CourseLinkOutcome;
}

/**
 * A course nobody has started a group in. The classmate count is the reason
 * to start one: it says people are there to fill it. With no classmates yet
 * a group would sit empty, so sharing the course link comes first.
 */
function NoGroupsYet({
  course,
  classmateCount,
  createGroupPath,
  shareButtonRef,
  onShare,
}: {
  course: Course;
  classmateCount: number;
  createGroupPath: string;
  shareButtonRef: Ref<HTMLButtonElement>;
  onShare: () => void;
}): ReactNode {
  if (classmateCount === 0) {
    return (
      <div className="cm-empty">
        <h2>You&rsquo;re the first {course.code} student here</h2>
        <p>
          A group is easier to fill once classmates have added the course. Share this link in the course Discord or
          GroupMe: anyone who opens it can add {course.code} in one tap.
        </p>
        <CopyLinkField url={courseLinkUrl(course.code)} inputId="course-link" ariaLabel="Course link" />
        <div className="cm-empty__actions">
          <Link className="cm-btn cm-btn--quiet" to={createGroupPath}>
            <PlusIcon />
            Create a group anyway
          </Link>
        </div>
      </div>
    );
  }

  const one = classmateCount === 1;
  return (
    <div className="cm-empty">
      <h2>
        <span className="cm-classmates">{classmateCount}</span>{' '}
        {one ? 'classmate' : 'classmates'} in {course.code} {one ? 'uses' : 'use'} Class Meet
      </h2>
      <p>
        {one ? 'They have not' : 'None of them has'} started a study group yet. Start the first one and they will see it
        here and can ask to join.
      </p>
      <div className="cm-empty__actions">
        <Link className="cm-btn cm-btn--primary" to={createGroupPath}>
          <PlusIcon />
          Create the first group
        </Link>
        <button ref={shareButtonRef} type="button" className="cm-btn cm-btn--secondary" onClick={onShare}>
          <LinkIcon />
          Share course link
        </button>
      </div>
    </div>
  );
}

function courseLinkNotice(outcome: CourseLinkOutcome, courseCode: string): string {
  return outcome === 'added'
    ? `${courseCode} was added to your courses.`
    : `${courseCode} is already in your courses, so the link brought you straight to its groups.`;
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
  const locationState = useLocation().state as StudyGroupsLocationState | null;
  // After a group is deleted the page the student was on is gone, so the
  // notice saying what happened takes focus.
  const deletedGroupTitle = locationState?.deletedGroupTitle;
  const deletedNotice = useCallback((notice: HTMLDivElement | null) => notice?.focus(), []);
  const courseLinkOutcome = locationState?.courseLinkOutcome;
  const [isShareOpen, setIsShareOpen] = useState(false);
  // Only one Share course link button is on the page at a time: in the
  // header, or in the empty state when the course has no groups.
  const shareButtonRef = useRef<HTMLButtonElement>(null);
  const openShare = (): void => setIsShareOpen(true);
  const closeShare = (): void => {
    setIsShareOpen(false);
    shareButtonRef.current?.focus();
  };

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
        {/* With no groups yet, the empty state below holds these actions instead. */}
        {hasGroups && (
          <div className="cm-actions cm-groups-actions">
            <button ref={shareButtonRef} type="button" className="cm-btn cm-btn--secondary" onClick={openShare}>
              <LinkIcon />
              Share course link
            </button>
            <Link className="cm-btn cm-btn--primary" to={createGroupPath}>
              <PlusIcon />
              Create group
            </Link>
          </div>
        )}
      </header>

      {deletedGroupTitle !== undefined && (
        <div ref={deletedNotice} className="cm-notice" role="status" tabIndex={-1}>
          <CheckCircleIcon />
          <span className="cm-notice__body">{deletedGroupTitle} was deleted.</span>
        </div>
      )}

      {courseLinkOutcome !== undefined && data !== null && (
        <div className="cm-notice" role="status">
          <CheckCircleIcon />
          <span className="cm-notice__body">{courseLinkNotice(courseLinkOutcome, data.course.code)}</span>
        </div>
      )}

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
        <NoGroupsYet
          course={data.course}
          classmateCount={data.classmateCount}
          createGroupPath={createGroupPath}
          shareButtonRef={shareButtonRef}
          onShare={openShare}
        />
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

      {isShareOpen && data !== null && <ShareCourseLinkDialog courseCode={data.course.code} onClose={closeShare} />}
    </ClassMeetLayout>
  );
}
