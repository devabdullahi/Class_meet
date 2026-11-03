
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function GroupDetailsPage(): ReactNode {
  const [requested, setRequested] = useState(false);

  return (
    <div className="cm-layout">
      <aside className="cm-sidebar">
        <h2>Class Meet</h2>
        <nav>
          <Link to="/courses">My Courses</Link>
          <Link to="/groups/CSE3311">Study Groups</Link>
        </nav>
      </aside>

      <main className="cm-main cm-details">
        <Link to="/groups/CSE3311">
          ← Back to Study Groups
        </Link>

        <p>CSE 3311 · Open</p>
        <h1>Design Patterns Core</h1>
        <p>Object Oriented Software Engineering</p>

        <section className="cm-card">
          <h2>Study Information</h2>
          <p><strong>Meeting days:</strong> Tuesdays & Thursdays</p>
          <p><strong>Time:</strong> 2:30 PM – 4:00 PM</p>
          <p><strong>Location:</strong> Central Library, Room 412</p>
          <p><strong>Group size:</strong> 4 / 6 members</p>

          <h3>Primary Goal</h3>
          <p>
            Mastering SOLID principles and structural design
            patterns for the upcoming course project.
          </p>
        </section>

        <section className="cm-card">
          <h2>Current Members</h2>
          <p>Sarah Jenkins — Group Leader</p>
          <p>Mike Thompson</p>
          <p>Leo Rodriguez</p>
          <p>Chloe Simmons</p>
        </section>

        <section className="cm-card">
          <h2>Ready to join?</h2>
          <p>Request to join this study group.</p>

          <button
            type="button"
            disabled={requested}
            onClick={() => setRequested(true)}
          >
            {requested ? 'Request Pending' : 'Request to Join'}
          </button>

          {requested && (
            <p>Demo only — no request has been sent.</p>
          )}
        </section>
      </main>
    </div>
  );
}
