/**
 * The signed-in main screen: your courses, with a way into each course's
 * study groups, plus the two actions that start something (add a course,
 * create a group).
 *
 * The course list is sample data until the courses API is wired in.
 */
import { useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AddCourseForm } from '../components/AddCourseForm';
import { AppHeader } from '../components/AppHeader';

const courses = [
  {
    code: 'CSE 3311',
    name: 'Object Oriented Software Engineering',
    groups: 6,
  },
  {
    code: 'CSE 4308',
    name: 'Artificial Intelligence',
    groups: 3,
  },
  {
    code: 'CSE 4316',
    name: 'Computer Networks',
    groups: 5,
  },
];

export function MyCoursesPage(): ReactNode {
  const [isAddCourseOpen, setIsAddCourseOpen] = useState(false);
  const addCourseButtonRef = useRef<HTMLButtonElement>(null);

  const handleCloseAddCourse = (): void => {
    setIsAddCourseOpen(false);
    addCourseButtonRef.current?.focus();
  };

  return (
    <div className="app">
      <AppHeader />

      <main className="page">
        <div className="page-heading">
          <div>
            <h1 className="page-heading__title">My Courses</h1>
            <p className="page-heading__subtitle">Choose a course to find a study group.</p>
          </div>
          <div className="page-heading__actions">
            <button
              ref={addCourseButtonRef}
              type="button"
              className="button"
              onClick={() => setIsAddCourseOpen(true)}
            >
              Add Course
            </button>
            <Link className="button" to="/groups/create">
              Create Group
            </Link>
          </div>
        </div>

        <p className="panel__hint">Demo data &mdash; courses are not yet connected to the backend.</p>

        <section className="course-grid" aria-label="Your courses">
          {courses.map((course) => (
            <article className="course-card" key={course.code}>
              <span className="badge">{course.code}</span>
              <h2 className="course-card__title">{course.name}</h2>
              <p className="panel__hint">{course.groups} available study groups</p>
              <Link className="button" to={`/groups/${course.code.replace(' ', '')}`}>
                View Groups &rarr;
              </Link>
            </article>
          ))}
        </section>
      </main>

      {isAddCourseOpen && <AddCourseForm onClose={handleCloseAddCourse} />}

      <footer className="footer">
        <p>
          Class Meet &middot; CSE 3311 Software Engineering II &middot; The University of Texas at
          Arlington
        </p>
      </footer>
    </div>
  );
}
