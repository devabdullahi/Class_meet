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
import { useAuth } from '../auth/useAuth';
import { Avatar } from '../components/Avatar';
import { Wordmark } from '../components/Wordmark';
import { EmptyState } from '../components/EmptyState';
import { BookIcon, PeopleIcon, LogoutIcon } from '../components/icons';

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
        <section className="greeting">
          <Avatar name={user.name} size={64} />
          <div>
            <h1 className="greeting__title">Hey, {firstName(user.name)}.</h1>
            <p className="greeting__subtitle">
              You&rsquo;re signed in with <strong>{user.email}</strong>. Next you&rsquo;ll add the
              courses you&rsquo;re taking, and this page will fill up with the study groups inside
              them.
            </p>
          </div>
        </section>

        <div className="banner" role="note">
          <span className="badge badge--phase">Iteration 1</span>
          <p>
            Sign-in is the only feature built so far. Course selection, group discovery and group
            creation are next &mdash; the sections below are where they will appear.
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
              <EmptyState
                icon={<BookIcon />}
                title="No courses yet"
                body="Adding courses from the university catalog is the next feature. Once a course is on this list, its study groups show up on the right."
                arrivingIn="Coming in iteration 1"
              />
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
              <EmptyState
                icon={<PeopleIcon />}
                title="Nothing to show until you have courses"
                body="Group discovery is scoped to the courses you add, so this list stays empty by design. Creating a group and joining one land in iteration 2."
                arrivingIn="Coming in iterations 1–2"
              />
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
