import { useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { AddCourseForm } from '../components/AddCourseForm';
import { ClassMeetLayout } from '../components/ClassMeetLayout';
import { CreateGroupForm } from '../components/CreateGroupForm';
import { AlertIcon, ChevronLeftIcon } from '../components/icons';
import { useApiData } from '../hooks/useApiData';

export function CreateGroupPage(): ReactNode {
  const [searchParams] = useSearchParams();
  const { data, error, loading, reload } = useApiData(
    () => api.fetchMyCourses(),
    [],
    'We could not load your courses. Please try again.',
  );
  const [isAddCourseOpen, setIsAddCourseOpen] = useState(false);
  const addCourseButtonRef = useRef<HTMLButtonElement>(null);

  const closeAddCourse = (): void => {
    setIsAddCourseOpen(false);
    addCourseButtonRef.current?.focus();
  };

  const courses = data?.courses ?? [];
  // Opened from a course's page: the group belongs to that course, and
  // Back and Cancel return there.
  const presetCourse = courses.find((course) => course.id === searchParams.get('course')) ?? null;
  const backTo = presetCourse === null ? '/' : `/groups/${presetCourse.id}`;
  const backLabel = presetCourse === null ? 'Back to my courses' : `Back to ${presetCourse.code}`;

  return (
    <ClassMeetLayout>
      <Link className="cm-back" to={backTo}>
        <ChevronLeftIcon />
        {backLabel}
      </Link>

      <header className="cm-pagehead">
        <div>
          <h1>Create a study group</h1>
          <p className="cm-pagehead__sub">Students in the course can find it and ask to join. You will lead it.</p>
        </div>
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
        <div className="cm-create-form cm-skeleton" aria-busy="true">
          <span className="cm-sr-only">Loading your courses</span>
        </div>
      )}

      {data !== null && courses.length === 0 && (
        <div className="cm-empty">
          <h2>Add a course first</h2>
          <p>Every study group belongs to a course. Add a course you are taking, then create its group here.</p>
          <button
            ref={addCourseButtonRef}
            type="button"
            className="cm-btn cm-btn--primary"
            onClick={() => setIsAddCourseOpen(true)}
          >
            Add a course
          </button>
        </div>
      )}

      {courses.length > 0 && (
        <CreateGroupForm courses={courses} presetCourse={presetCourse} cancelTo={backTo} />
      )}

      {isAddCourseOpen && <AddCourseForm onClose={closeAddCourse} onAdded={reload} />}
    </ClassMeetLayout>
  );
}
