/**
 * What a course link (/join/CSE-3311) opens for a signed-in student: the
 * course, how many classmates already use Class Meet, the groups meeting
 * soonest, and one action, adding the course, which then shows its groups.
 * A student who already has the course goes straight to its groups; a code
 * the catalog does not know gets a way to search for the right course.
 */
import { useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { api, type Course, type GroupSummary } from '../api';
import { AddCourseForm } from '../components/AddCourseForm';
import { ClassMeetLayout } from '../components/ClassMeetLayout';
import { TimeTile } from '../components/groupParts';
import { AlertIcon, ChevronLeftIcon, PlusIcon } from '../components/icons';
import { courseCodeFromLinkCode, type CourseLinkOutcome } from '../courseLink';
import {
  formatMeetingTime,
  groupTitle,
  isGroupFull,
  meetingPlaceLabel,
  seatsLeft,
  sortByNextMeeting,
} from '../groupFormat';
import { describeError, useApiData } from '../hooks/useApiData';

/** Enough to show what the course's groups are like without listing them all. */
const PREVIEW_GROUP_COUNT = 3;

function classmatesLine(classmateCount: number): string {
  if (classmateCount === 0) return 'You would be the first student in this course on Class Meet.';
  if (classmateCount === 1) return '1 student in this course already uses Class Meet.';
  return `${classmateCount} students in this course already use Class Meet.`;
}

/** "5 have open seats. The next one meets Tuesday at 6:00 PM." Groups must be soonest first. */
function openSeatsLine(groupsSoonestFirst: GroupSummary[]): string {
  const open = groupsSoonestFirst.filter((group) => !isGroupFull(group));
  const next = open[0];
  if (next === undefined) {
    return groupsSoonestFirst.length === 1 ? 'It is full right now.' : 'All of them are full right now.';
  }
  const meets = `${next.meetingDay} at ${formatMeetingTime(next.meetingTime)}`;
  if (groupsSoonestFirst.length === 1) return `It has open seats and meets ${meets}.`;
  if (open.length === 1) return `1 has open seats. It meets ${meets}.`;
  return `${open.length} have open seats. The next one meets ${meets}.`;
}

function seatsText(group: GroupSummary): string {
  const left = seatsLeft(group);
  if (left === 0) return 'Full';
  return `${left} ${left === 1 ? 'seat' : 'seats'} left of ${group.maxMembers}`;
}

/** Read-only, and not links: the groups open once the course is added. */
function GroupPreview({ group }: { group: GroupSummary }): ReactNode {
  return (
    <li>
      <TimeTile day={group.meetingDay} time={group.meetingTime} full={isGroupFull(group)} />
      <div className="cm-preview__text">
        <span className="cm-preview__title">{groupTitle(group)}</span>
        <span className="cm-preview__meta">
          {meetingPlaceLabel(group)} · {seatsText(group)}
        </span>
      </div>
    </li>
  );
}

function AddCoursePanel({
  course,
  groupsSoonestFirst,
}: {
  course: Course;
  groupsSoonestFirst: GroupSummary[];
}): ReactNode {
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const groupCount = groupsSoonestFirst.length;

  async function addCourse(): Promise<void> {
    setAdding(true);
    setAddError(null);
    try {
      await api.enrollInCourse(course.id);
      const state: { courseLinkOutcome: CourseLinkOutcome } = { courseLinkOutcome: 'added' };
      // Replaced, so Back does not return to an offer the student has taken.
      navigate(`/groups/${course.id}`, { replace: true, state });
    } catch (failure) {
      setAddError(describeError(failure, `We could not add ${course.code}. Please try again.`));
      setAdding(false);
    }
  }

  return (
    <section className="cm-panel cm-action">
      <h2 className="cm-action__headline">
        {groupCount === 0 ? 'No study groups yet' : `${groupCount} study ${groupCount === 1 ? 'group' : 'groups'}`}
      </h2>
      <p className="cm-panel__text">
        {groupCount === 0
          ? 'Add the course and start the first one. Classmates who add it will see your group and can ask to join.'
          : openSeatsLine(groupsSoonestFirst)}
      </p>
      {addError !== null && (
        <div className="cm-notice cm-notice--error" role="alert">
          <AlertIcon />
          <span className="cm-notice__body">{addError}</span>
        </div>
      )}
      <button
        type="button"
        className="cm-btn cm-btn--primary cm-btn--block"
        disabled={adding}
        onClick={() => void addCourse()}
      >
        <PlusIcon />
        {adding ? 'Adding…' : `Add ${course.code} to my courses`}
      </button>
    </section>
  );
}

function CourseNotFound({ linkCode }: { linkCode: string }): ReactNode {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const closeSearch = (): void => {
    setIsSearchOpen(false);
    searchButtonRef.current?.focus();
  };

  return (
    <>
      <Link className="cm-back" to="/">
        <ChevronLeftIcon />
        Back to my courses
      </Link>
      <div className="cm-empty">
        <h1 className="cm-empty__title">We can&rsquo;t find {courseCodeFromLinkCode(linkCode)}</h1>
        <p>
          The link you opened is for a course that is not in Class Meet&rsquo;s catalog. The code may have a typo:
          check it with whoever shared the link, or search for the course.
        </p>
        <button
          ref={searchButtonRef}
          type="button"
          className="cm-btn cm-btn--primary"
          onClick={() => setIsSearchOpen(true)}
        >
          Search courses
        </button>
      </div>
      {isSearchOpen && <AddCourseForm onClose={closeSearch} />}
    </>
  );
}

export function JoinCoursePage(): ReactNode {
  const { linkCode = '' } = useParams();
  const { data, error, notFound, loading, reload } = useApiData(
    () => api.fetchCourseByLinkCode(linkCode),
    [linkCode],
    'We could not open this course link. Please try again.',
  );

  if (data?.enrolled === true) {
    const state: { courseLinkOutcome: CourseLinkOutcome } = { courseLinkOutcome: 'already_added' };
    return <Navigate to={`/groups/${data.course.id}`} replace state={state} />;
  }

  if (notFound) {
    return (
      <ClassMeetLayout>
        <CourseNotFound linkCode={linkCode} />
      </ClassMeetLayout>
    );
  }

  const groupsSoonestFirst = sortByNextMeeting(data?.groups ?? [], new Date());
  const preview = groupsSoonestFirst.slice(0, PREVIEW_GROUP_COUNT);
  const notPreviewed = groupsSoonestFirst.length - preview.length;

  return (
    <ClassMeetLayout>
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
          <span className="cm-sr-only">Loading the course</span>
          <div className="cm-skeleton" />
          <div className="cm-skeleton" />
        </div>
      )}

      {data !== null && (
        <>
          <header className="cm-pagehead">
            <div>
              <p className="cm-code cm-pagehead__eyebrow">{data.course.code}</p>
              <h1>{data.course.title}</h1>
              <p className="cm-pagehead__sub">{classmatesLine(data.classmateCount)}</p>
            </div>
          </header>

          {preview.length === 0 ? (
            <div className="cm-join__solo">
              <AddCoursePanel course={data.course} groupsSoonestFirst={groupsSoonestFirst} />
            </div>
          ) : (
            <div className="cm-details-grid">
              <div className="cm-stack cm-aside">
                <AddCoursePanel course={data.course} groupsSoonestFirst={groupsSoonestFirst} />
              </div>
              <div className="cm-stack cm-details-main">
                <section className="cm-panel" aria-labelledby="meeting-soonest">
                  <h2 id="meeting-soonest">Meeting soonest</h2>
                  <ul className="cm-preview">
                    {preview.map((group) => (
                      <GroupPreview key={group.id} group={group} />
                    ))}
                  </ul>
                  {notPreviewed > 0 && (
                    <p className="cm-preview__more">
                      {notPreviewed} more {notPreviewed === 1 ? 'group' : 'groups'} once you add the course.
                    </p>
                  )}
                </section>
              </div>
            </div>
          )}
        </>
      )}
    </ClassMeetLayout>
  );
}
