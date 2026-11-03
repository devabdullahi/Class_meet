/**
 * The signed-in landing page.
 *
 * It lays out the shell of the real product — your courses, and the study
 * groups inside those courses — and says plainly that neither is built yet.
 * The alternative (hiding the structure until it works) would make the
 * iteration-1 demo look like less than it is, and the alternative to *that*
 * (fake seeded cards) would make it look like more.
 */
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { Avatar } from '../components/Avatar';
import { Wordmark } from '../components/Wordmark';
import { LogoutIcon } from '../components/icons';

function firstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0];
  return first !== undefined && first.length > 0 ? first : fullName;
}

export function HomePage(): ReactNode {
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  if (user === null) {
    // RequireAuth guarantees a user here; this keeps the type honest.
    return null;
  }

  const handleSignOut = (): void => {
    setSigningOut(true);
    void signOut().finally(() => setSigningOut(false));
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__inner">
          <Wordmark compact />
          <div className="topbar__account">
            <div className="topbar__identity">
              <span className="topbar__name">{user.name}</span>
              <span className="topbar__email">{user.email}</span>
            </div>
            <Avatar name={user.name} size={36} />
            <button
              type="button"
              className="button button--ghost"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              <span className="button__icon">
                <LogoutIcon />
              </span>
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      </header>

      <main className="page">
       <Link to="/courses" className="button">
    My Courses →
  </Link>

        <section className="greeting">
          <Avatar name={user.name} size={64} />
          <div>
            <h1 className="greeting__title">Hey, {firstName(user.name)}.</h1>
            <p className="greeting__subtitle">
              You&rsquo;re signed in with <strong>{user.email}</strong>.
              Explore your courses, browse available study groups, and view group details below.
            </p>
          </div>
        </section>

        <div className="banner" role="note">
          <span className="badge badge--phase">Iteration 2</span>
          <p>
           Sign-in is working, and the My Courses, Study Groups, and Group Details pages are ready for demonstration. Study groups currently use sample data; backend integration is still in progress.
          </p>
        </div>

        <div className="columns">
          <section className="panel" aria-labelledby="courses-heading">
            <div className="panel__header">
              <h2 className="panel__title" id="courses-heading">
                Your courses
              </h2>
              <p className="panel__hint">The exact sections you&rsquo;re enrolled in this term.</p>
            </div>
            <div className="panel__body">
             <div>
  <p>Browse your courses and discover available study groups.</p>
  <Link to="/courses" className="button">
    View My Courses →
  </Link>
  <p>Currently using sample data for the frontend demo.</p>
</div>
            </div>
          </section>

          <section className="panel panel--wide" aria-labelledby="groups-heading">
            <div className="panel__header">
              <h2 className="panel__title" id="groups-heading">
                Study groups in your courses
              </h2>
              <p className="panel__hint">
                Day, time, place and seats left &mdash; for your courses only.
              </p>
            </div>
            <div className="panel__body">
             <div>
               <p>Explore study groups, check meeting details, and request to join.</p>

              <Link to="/groups/CSE3311" className="button">
                 Browse Study Groups →
              </Link>

              <p>Frontend demo using sample data. Backend integration is pending.</p>
            </div>
            </div>
          </section>
        </div>
      </main>

      <footer className="footer">
        <p>
          Class Meet &middot; CSE 3311 Software Engineering II &middot; The University of Texas at
          Arlington
        </p>
      </footer>
    </div>
  );
}
