import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { Avatar } from './Avatar';
import { BookIcon, LogoutIcon, PeopleIcon, PlusIcon } from './icons';
import { Wordmark } from './Wordmark';

interface ClassMeetLayoutProps {
  children: ReactNode;
}

/** My Courses covers a course's study groups and their details too: they are reached from it. */
function isInMyCourses(pathname: string): boolean {
  return pathname === '/' || (pathname.startsWith('/groups/') && pathname !== '/groups/create');
}

/**
 * The shell for every signed-in screen: navigation, the signed-in student,
 * and the content area. Wide screens get a sidebar; phones get a top bar
 * with an account menu and a bottom tab bar (see screens.css).
 */
export function ClassMeetLayout({ children }: ClassMeetLayoutProps): ReactNode {
  const { user, signOut } = useAuth();
  const { pathname } = useLocation();
  const [signingOut, setSigningOut] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  // The phone account menu closes on a click or tap anywhere else.
  useEffect(() => {
    if (!accountMenuOpen) return undefined;
    const closeOnOutsideClick = (event: MouseEvent): void => {
      if (!accountRef.current?.contains(event.target as Node)) setAccountMenuOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [accountMenuOpen]);

  const handleSignOut = (): void => {
    setSigningOut(true);
    void signOut().finally(() => setSigningOut(false));
  };

  const inMyCourses = isInMyCourses(pathname);

  return (
    <div className="cm-layout">
      <aside className="cm-sidebar">
        <div className="cm-brand">
          <Wordmark compact />
        </div>

        <nav className="cm-nav" aria-label="Main">
          <Link to="/" className="cm-nav__link" aria-current={inMyCourses ? 'page' : undefined}>
            <BookIcon />
            My courses
          </Link>
          <Link
            to="/my-groups"
            className="cm-nav__link"
            aria-current={pathname === '/my-groups' ? 'page' : undefined}
          >
            <PeopleIcon />
            My groups
          </Link>
          <Link
            to="/groups/create"
            className="cm-nav__link"
            aria-current={pathname === '/groups/create' ? 'page' : undefined}
          >
            <PlusIcon />
            Create group
          </Link>
        </nav>

        {user !== null && (
          <div
            ref={accountRef}
            className="cm-account"
            data-open={accountMenuOpen}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setAccountMenuOpen(false);
            }}
          >
            {/* Shown only on phones, where the account details fold into a menu. */}
            <button
              type="button"
              className="cm-account__toggle"
              aria-label="Account"
              aria-expanded={accountMenuOpen}
              aria-controls="cm-account-panel"
              onClick={() => setAccountMenuOpen((open) => !open)}
            >
              <Avatar name={user.name} size={36} />
            </button>
            <div id="cm-account-panel" className="cm-account__panel">
              <div className="cm-account__who">
                <Avatar name={user.name} size={36} />
                <div>
                  <p className="cm-account__name">{user.name}</p>
                  <p className="cm-account__email" title={user.email}>
                    {user.email}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="cm-btn cm-btn--quiet cm-btn--sm"
                onClick={handleSignOut}
                disabled={signingOut}
              >
                <LogoutIcon />
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          </div>
        )}
      </aside>

      <main className="cm-main">{children}</main>
    </div>
  );
}
