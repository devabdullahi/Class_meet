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
import { useApiData } from '../hooks/useApiData';

export function MyCoursesPage(): ReactNode {
  const { data, error, loading, reload } = useApiData(() => api.fetchMyCourses(), []);
  const [isAddCourseOpen, setIsAddCourseOpen] = useState(false);
  const addCourseButtonRef = useRef<HTMLButtonElement>(null);

  const handleCloseAddCourse = (): void => {
    setIsAddCourseOpen(false);
    addCourseButtonRef.current?.focus();
  };

  const courses = data?.courses ?? [];

  return (
    <ClassMeetLayout>
      <header className="cm-header cm-header--actions">
        <div>
          <h1>My Courses</h1>
          <p>Choose a course to find a study group.</p>
        </div>
        <div className="cm-actions">
          <button
            ref={addCourseButtonRef}
            type="button"
            className="cm-button"
            onClick={() => setIsAddCourseOpen(true)}
          >
            Add Course
          </button>
          <Link className="cm-button" to="/groups/create">
            Create Group
          </Link>
        </div>
      </header>

      {loading && data === null && <p className="cm-note">Loading your courses…</p>}
      {error !== null && (
        <p className="cm-error" role="alert">
          {error}
        </p>
      )}
      {data !== null && courses.length === 0 && (
        <p className="cm-note">You have not added any courses yet. Use Add Course to find yours.</p>
      )}

      <section className="cm-courses" aria-label="Your courses">
        {courses.map((course) => (
          <article className="cm-course-card" key={course.id}>
            <span>{course.code}</span>
            <h2>{course.title}</h2>
            <p>
              {course.groupCount} {course.groupCount === 1 ? 'study group' : 'study groups'}
            </p>
            <Link to={`/groups/${course.id}`}>View Groups →</Link>
          </article>
        ))}
      </section>

      {isAddCourseOpen && <AddCourseForm onClose={handleCloseAddCourse} onAdded={reload} />}
    </ClassMeetLayout>
  );
}
