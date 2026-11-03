import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { Avatar } from './Avatar';
import { BookIcon, LogoutIcon, PlusIcon } from './icons';
import { Wordmark } from './Wordmark';
import '../screens.css';

interface ClassMeetLayoutProps {
  children: ReactNode;
}

/**
 * The shell shared by the My Courses, Study Groups and Group Details screens:
 * the sidebar with navigation and the signed-in student, plus the content area.
 */
export function ClassMeetLayout({ children }: ClassMeetLayoutProps): ReactNode {
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = (): void => {
    setSigningOut(true);
    void signOut().finally(() => setSigningOut(false));
  };

  return (
    <div className="cm-layout">
      <aside className="cm-sidebar">
        <div className="cm-brand">
          <Wordmark compact />
        </div>

        <nav className="cm-nav" aria-label="Main">
          <NavLink to="/" end className="cm-nav__link">
            <BookIcon />
            My Courses
          </NavLink>
          <NavLink to="/groups/create" className="cm-nav__link">
            <PlusIcon />
            Create Group
          </NavLink>
        </nav>

        {user !== null && (
          <div className="cm-account">
            <div className="cm-account__who">
              <Avatar name={user.name} size={36} />
              <div>
                <p className="cm-account__name">{user.name}</p>
                <p className="cm-account__email" title={user.email}>
                  {user.email}
                </p>
              </div>
            </div>
            <button type="button" className="cm-btn cm-btn--quiet cm-btn--sm" onClick={handleSignOut} disabled={signingOut}>
              <LogoutIcon />
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        )}
      </aside>

      <main className="cm-main">{children}</main>
    </div>
  );
}
