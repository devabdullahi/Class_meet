import { useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { EntraSignInButton } from '../components/EntraSignInButton';
import { FullPageSpinner } from '../components/FullPageSpinner';
import { Wordmark } from '../components/Wordmark';

/**
 * Where to go after signing in: the page RequireAuth remembered, if it is a
 * path inside this app. Anything else (nothing remembered, "//other.site",
 * the login page itself) goes to My courses.
 */
function returnPath(state: unknown): string {
  const from = typeof state === 'object' && state !== null ? (state as { from?: unknown }).from : undefined;
  const isAppPath = typeof from === 'string' && from.startsWith('/') && !from.startsWith('//');
  return isAppPath && from !== '/login' ? from : '/';
}

export function LoginPage(): ReactNode {
  const { status, error, config, signIn, devSignIn, clearError } = useAuth();
  const location = useLocation();
  const [submitting, setSubmitting] = useState(false);

  if (status === 'loading') {
    return <FullPageSpinner label="Checking your session" />;
  }

  if (status === 'signed-in') {
    return <Navigate to={returnPath(location.state)} replace />;
  }

  const handleSignIn = (): void => {
    clearError();
    setSubmitting(true);
    void signIn().finally(() => setSubmitting(false));
  };

  const handleDevSignIn = (): void => {
    clearError();
    setSubmitting(true);
    void devSignIn().finally(() => setSubmitting(false));
  };

  // The organisation name comes from the server, which is also the side that
  // enforces it, so the copy cannot promise something the policy does not.
  const tenantCopy =
    config !== null
      ? `Sign in with the account you use for email and Canvas at ${config.tenantDisplayName}.`
      : 'Sign in with your university account.';

  return (
    <main className="cm-login">
      <section className="cm-login__card">
        <Wordmark />
        <h1 className="cm-login__title">Find a study group for the course you&rsquo;re actually in.</h1>
        <p className="cm-login__subtitle">
          Class Meet lists the open study groups for your courses: day, time, place and seats left.
          You do not need an invite.
        </p>

        <div className="cm-login__action">
          <EntraSignInButton onClick={handleSignIn} busy={submitting} ready={config !== null} />
          <p className="cm-login__note">{tenantCopy}</p>
        </div>

        {error !== null && (
          <div className="cm-notice cm-notice--error" role="alert">
            <div className="cm-notice__body">
              <strong>Could not sign you in</strong>
              <p>{error}</p>
            </div>
          </div>
        )}

        {/*
          DEVELOPMENT SIGN-IN BYPASS — REMOVE BEFORE THE PILOT.
          Iteration-1 scaffolding so the home screen can be worked on before
          anyone has registered the Entra app or created the Neon project. It
          appears only when the *server* says it is enabled (NODE_ENV is not
          production AND ALLOW_DEV_LOGIN=true), never on the strength of a
          client-side build flag, so a production bundle cannot show a button
          the server would honour. Delete this block, `devSignIn`, and
          `server/src/dev-login.ts` together.
        */}
        {config?.devLoginEnabled === true && (
          <div className="cm-login__dev">
            <button
              type="button"
              className="cm-btn cm-btn--quiet cm-btn--sm"
              onClick={handleDevSignIn}
              disabled={submitting}
            >
              Skip sign-in (development only)
            </button>
            <p className="cm-login__dev-note">
              Signs you in as a demo student when Microsoft sign-in is not set up. Removed before
              deployment.
            </p>
          </div>
        )}
      </section>

      <footer className="cm-login__footer">
        <p>
          A CSE 3311 project at the University of Texas at Arlington.
        </p>
      </footer>
    </main>
  );
}
