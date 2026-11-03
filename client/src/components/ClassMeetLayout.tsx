import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

interface ClassMeetLayoutProps {
  children: ReactNode;
  /** Extra class on the content area, for pages that need their own width. */
  mainClassName?: string;
}

/**
 * The shell shared by the My Courses, Study Groups and Group Details screens:
 * the dark sidebar with navigation and the signed-in student, plus the content area.
 */
export function ClassMeetLayout({ children, mainClassName = '' }: ClassMeetLayoutProps): ReactNode {
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = (): void => {
    setSigningOut(true);
    void signOut().finally(() => setSigningOut(false));
  };

  return (
    <div className="cm-layout">
      <aside className="cm-sidebar">
        <h2>Class Meet</h2>
        <nav>
          <Link to="/">My Courses</Link>
          <Link to="/groups/create">Create Group</Link>
        </nav>
        {user !== null && (
          <div className="cm-account">
            <p className="cm-account__name">{user.name}</p>
            <p className="cm-account__email">{user.email}</p>
            <button type="button" onClick={handleSignOut} disabled={signingOut}>
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        )}
      </aside>

      <main className={`cm-main ${mainClassName}`.trim()}>{children}</main>
    </div>
  );
}
