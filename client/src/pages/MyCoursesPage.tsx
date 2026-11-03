
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

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
  return (
    <div className="cm-layout">
      <aside className="cm-sidebar">
        <h2>Class Meet</h2>
        <nav>
          <Link to="/courses">My Courses</Link>
          <Link to="/groups/CSE3311">Study Groups</Link>
        </nav>
      </aside>

      <main className="cm-main">
        <header className="cm-header">
          <h1>My Courses</h1>
          <p>Choose a course to find a study group.</p>
        </header>

        <section className="cm-courses">
          {courses.map((course) => (
            <article className="cm-course-card" key={course.code}>
              <span>{course.code}</span>
              <h2>{course.name}</h2>
              <p>{course.groups} available study groups</p>
              <Link to={`/groups/${course.code.replace(' ', '')}`}>
                View Groups →
              </Link>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
