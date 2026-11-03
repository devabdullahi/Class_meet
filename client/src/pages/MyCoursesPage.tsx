/**
 * The signed-in main screen: the student's courses, each with a way into its
 * study groups, plus the two actions that start something (add a course,
 * create a group).
 */
import { useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { AddCourseForm } from '../components/AddCourseForm';
import { ClassMeetLayout } from '../components/ClassMeetLayout';
import { AlertIcon, PlusIcon } from '../components/icons';
import { useApiData } from '../hooks/useApiData';

export function MyCoursesPage(): ReactNode {
  const { data, error, loading, reload } = useApiData(() => api.fetchMyCourses(), []);
  const [isAddCourseOpen, setIsAddCourseOpen] = useState(false);
  const addCourseButtonRef = useRef<HTMLButtonElement>(null);

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
          <h1>My Courses</h1>
          <p className="cm-pagehead__sub">Pick a course to see its study groups.</p>
        </div>
        <div className="cm-actions">
          <button ref={addCourseButtonRef} type="button" className="cm-btn cm-btn--secondary" onClick={openAddCourse}>
            <PlusIcon />
            Add Course
          </button>
          <Link className="cm-btn cm-btn--primary" to="/groups/create">
            Create Group
          </Link>
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
            <article className="cm-card" key={course.id}>
              <span className="cm-code">{course.code}</span>
              <h2 className="cm-card__title">{course.title}</h2>
              <div className="cm-card__foot">
                <span className="cm-card__muted">
                  {course.groupCount} {course.groupCount === 1 ? 'study group' : 'study groups'}
                </span>
                <Link className="cm-btn cm-btn--secondary cm-btn--sm" to={`/groups/${course.id}`}>
                  View groups
                </Link>
              </div>
            </article>
          ))}
        </section>
      )}

      {isAddCourseOpen && <AddCourseForm onClose={handleCloseAddCourse} onAdded={reload} />}
    </ClassMeetLayout>
  );
}
