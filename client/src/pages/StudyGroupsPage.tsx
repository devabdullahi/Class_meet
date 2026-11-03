
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

const groups = [
  {
    id: 1,
    name: 'Design Patterns Core',
    day: 'Tuesday & Thursday',
    time: '2:30 PM - 4:00 PM',
    location: 'Central Library, Room 412',
    format: 'In Person',
    members: '4/6',
    goal: 'Mastering SOLID principles and design patterns.',
    status: 'Open',
  },
  {
    id: 2,
    name: 'Object-Oriented Ninjas',
    day: 'Wednesday',
    time: '6:00 PM - 8:00 PM',
    location: 'Online',
    format: 'Online',
    members: '5/5',
    goal: 'Advanced Java concepts and inheritance.',
    status: 'Full',
  },
  {
    id: 3,
    name: 'UML Diagram Dynamic',
    day: 'Monday',
    time: '11:00 AM - 1:00 PM',
    location: 'Engineering Lab 204',
    format: 'In Person',
    members: '2/4',
    goal: 'Creating UML sequence and class diagrams.',
    status: 'Open',
  },
  {
    id: 4,
    name: 'Agile & Scrum Circle',
    day: 'Friday',
    time: '4:00 PM - 5:30 PM',
    location: 'Online',
    format: 'Online',
    members: '3/10',
    goal: 'Practicing sprint planning and backlog grooming.',
    status: 'Open',
  },
  {
    id: 5,
    name: 'The SOLID Six',
    day: 'Saturday',
    time: '10:00 AM - 12:00 PM',
    location: 'Student Union',
    format: 'In Person',
    members: '6/6',
    goal: 'Weekly study sessions for SOLID principles.',
    status: 'Full',
  },
  {
    id: 6,
    name: 'Refactoring Rebels',
    day: 'Thursday',
    time: '7:00 PM - 9:00 PM',
    location: 'Online',
    format: 'Online',
    members: '4/8',
    goal: 'Improving Java refactoring techniques.',
    status: 'Open',
  },
];

export function StudyGroupsPage(): ReactNode {
  const [day, setDay] = useState('Any Day');
  const [format, setFormat] = useState('Any Format');
  const [availability, setAvailability] = useState('All');

  const filteredGroups = groups.filter((group) => {
    return (
      (day === 'Any Day' || group.day.includes(day)) &&
      (format === 'Any Format' || group.format === format) &&
      (availability === 'All' || group.status === availability)
    );
  });

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
        <Link to="/courses">← Back to My Courses</Link>

        <header className="cm-header">
          <h1>CSE 3311 — Study Groups</h1>
          <p>Object Oriented Software Engineering</p>
        </header>

        <div className="cm-filters">
          <select value={day} onChange={(e) => setDay(e.target.value)}>
            <option>Any Day</option>
            <option>Monday</option>
            <option>Tuesday</option>
            <option>Wednesday</option>
            <option>Thursday</option>
            <option>Friday</option>
            <option>Saturday</option>
          </select>

          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            <option>Any Format</option>
            <option>Online</option>
            <option>In Person</option>
          </select>

          <select
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
          >
            <option value="All">All Groups</option>
            <option value="Open">Open</option>
            <option value="Full">Full</option>
          </select>
        </div>

        <p className="cm-demo-note">
          Demo data — groups are not yet connected to the backend.
        </p>

        <section className="cm-courses">
          {filteredGroups.map((group) => (
            <article className="cm-course-card" key={group.id}>
              <span>{group.status}</span>
              <h2>{group.name}</h2>
              <p>{group.day} · {group.time}</p>
              <p>{group.location} ({group.format})</p>
              <p>Members: {group.members}</p>
              <p>{group.goal}</p>

              {group.status === 'Full' ? (
                <button type="button" disabled>Group Full</button>
              ) : (
                <Link to={`/groups/CSE3311/${group.id}`}>
                  View Group →
                </Link>
              )}
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
