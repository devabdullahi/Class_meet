/**
 * The signed-in main screen: the student's courses, each leading to its
 * study groups, plus the two actions that start something (add a course,
 * create a group). Each course can also be removed, after a confirmation.
 */
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, type EnrolledCourse } from '../api';
import { AddCourseForm } from '../components/AddCourseForm';
import { ClassMeetLayout } from '../components/ClassMeetLayout';
import { InlineConfirm } from '../components/InlineConfirm';
import { AlertIcon, CheckCircleIcon, PlusIcon } from '../components/icons';
import { useApiData } from '../hooks/useApiData';

/** "6 groups · 4 open", so a busy course looks different from an empty one. */
function GroupCounts({ course }: { course: EnrolledCourse }): ReactNode {
  if (course.groupCount === 0) {
    return <p className="cm-card__muted">No groups yet — start one</p>;
  }
  return (
    <p className="cm-card__muted">
      {course.groupCount} {course.groupCount === 1 ? 'group' : 'groups'}
      {course.openGroupCount > 0 && (
        <>
          {' · '}
          <strong>{course.openGroupCount} open</strong>
        </>
      )}
    </p>
  );
}

/**
 * The whole card is one link, named by the course title. Remove sits above
 * the link in the corner; its question opens at the foot of the card.
 */
function CourseCard({ course, onRemove }: { course: EnrolledCourse; onRemove: () => Promise<void> }): ReactNode {
  return (
    <article className="cm-card cm-course-card">
      <span className="cm-code">{course.code}</span>
      <h2 className="cm-card__title">
        <Link className="cm-card__link" to={`/groups/${course.id}`}>
          {course.title}
        </Link>
      </h2>
      <div className="cm-card__foot">
        <GroupCounts course={course} />
        {course.joinedGroupCount > 0 && (
          <span className="cm-tag">You&rsquo;re in {course.joinedGroupCount}</span>
        )}
      </div>
      <InlineConfirm
        label="Remove"
        busyLabel="Removing…"
        ariaLabel={`Remove ${course.code}`}
        question={`Remove ${course.code} from your courses?`}
        consequence="Any requests you sent to its groups are withdrawn. You can add it again later."
        failureMessage={`We could not remove ${course.code}. Please try again.`}
        onConfirm={onRemove}
        className="cm-course-card__remove"
      />
    </article>
  );
}

export function MyCoursesPage(): ReactNode {
  const { data, error, loading, reload } = useApiData(
    () => api.fetchMyCourses(),
    [],
    'We could not load your courses. Please try again.',
  );
  const [isAddCourseOpen, setIsAddCourseOpen] = useState(false);
  const addCourseButtonRef = useRef<HTMLButtonElement>(null);
  const [removedCourseCode, setRemovedCourseCode] = useState<string | null>(null);
  // The removed course's card, and the button that was focused in it, are
  // gone, so the notice saying what happened takes focus.
  const removedNotice = useCallback((notice: HTMLDivElement | null) => notice?.focus(), []);

  async function removeCourse(course: EnrolledCourse): Promise<void> {
    await api.removeCourse(course.id);
    setRemovedCourseCode(course.code);
    reload();
  }

  const openAddCourse = (): void => setIsAddCourseOpen(true);
  const handleCloseAddCourse = (): void => {
    setIsAddCourseOpen(false);
    addCourseButtonRef.current?.focus();
  };

  const courses = data?.courses ?? [];

  return (
    <ClassMeetLayout>
      <header className="cm-pagehead">
        <div>
          <h1>My courses</h1>
          <p className="cm-pagehead__sub">Pick a course to see its study groups.</p>
        </div>
        <div className="cm-actions">
          <button ref={addCourseButtonRef} type="button" className="cm-btn cm-btn--secondary" onClick={openAddCourse}>
            <PlusIcon />
            Add course
          </button>
          {/* A group needs a course, so Create Group appears once there is one. */}
          {courses.length > 0 && (
            <Link className="cm-btn cm-btn--primary" to="/groups/create">
              Create group
            </Link>
          )}
        </div>
      </header>

      {removedCourseCode !== null && (
        <div key={removedCourseCode} ref={removedNotice} className="cm-notice" role="status" tabIndex={-1}>
          <CheckCircleIcon />
          <span className="cm-notice__body">{removedCourseCode} was removed from your courses.</span>
        </div>
      )}

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
          <span className="cm-sr-only">Loading your courses</span>
          <div className="cm-skeleton" />
          <div className="cm-skeleton" />
        </div>
      )}

      {data !== null && courses.length === 0 && (
        <div className="cm-empty">
          <h2>No courses yet</h2>
          <p>Add the courses you are taking to see the study groups students have started for them.</p>
          <button type="button" className="cm-btn cm-btn--primary" onClick={openAddCourse}>
            Add your first course
          </button>
        </div>
      )}

      {courses.length > 0 && (
        <section className="cm-card-grid" aria-label="Your courses">
          {courses.map((course) => (
            <CourseCard key={course.id} course={course} onRemove={() => removeCourse(course)} />
          ))}
        </section>
      )}

      {isAddCourseOpen && <AddCourseForm onClose={handleCloseAddCourse} onAdded={reload} />}
    </ClassMeetLayout>
  );
}
