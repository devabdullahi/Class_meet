import { useState, type ReactNode } from 'react';
import { useAuth } from '../auth/useAuth';
import { Avatar } from './Avatar';
import { Wordmark } from './Wordmark';
import { LogoutIcon } from './icons';

/** The signed-in top bar: product name, who you are, and sign out. */
export function AppHeader(): ReactNode {
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
  );
}
