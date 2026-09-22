import { useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { EntraSignInButton } from '../components/EntraSignInButton';
import { FullPageSpinner } from '../components/FullPageSpinner';
import { Wordmark } from '../components/Wordmark';

export function LoginPage(): ReactNode {
  const { status, error, config, signIn, devSignIn, clearError } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  if (status === 'loading') {
    return <FullPageSpinner label="Checking your session" />;
  }

  if (status === 'signed-in') {
    return <Navigate to="/" replace />;
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
      ? `Sign in with your ${config.tenantDisplayName} account — the one you use for email and Canvas.`
      : 'Sign in with your university account.';

  return (
    <main className="login">
      <section className="login__card">
        <Wordmark />
        <h1 className="login__title">Find a study group for the course you&rsquo;re actually in.</h1>
        <p className="login__subtitle">
          Class Meet lists the open study groups for your exact courses &mdash; day, time, place and
          seats left. No invite from someone you already know required.
        </p>

        <div className="login__action">
          <EntraSignInButton onClick={handleSignIn} busy={submitting} ready={config !== null} />
        </div>

        <p className="login__domain-note">{tenantCopy}</p>

        {error !== null && (
          <div className="alert alert--error" role="alert">
            <strong className="alert__title">Could not sign you in</strong>
            <p className="alert__body">{error}</p>
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
          <div className="login__dev">
            <button
              type="button"
              className="button button--ghost login__dev-button"
              onClick={handleDevSignIn}
              disabled={submitting}
            >
              Skip sign-in (development only)
            </button>
            <p className="login__dev-note">
              This exists because Microsoft Entra ID and the database are not configured yet. It
              signs you in as a fake student so the rest of the app can be built, and it is
              removed before deployment.
            </p>
          </div>
        )}
      </section>

      <footer className="login__footer">
        <p>
          A CSE 3311 project at the University of Texas at Arlington. Iteration 1 &mdash; sign-in
          only.
        </p>
      </footer>
    </main>
  );
}
