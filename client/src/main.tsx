/**
 * React entry point.
 *
 * MSAL has to be created and awaited before anything renders, because
 * `initialize()` is asynchronous and `MsalProvider` expects an instance that
 * has already finished it. So this file is the one place in the app that deals
 * with "we are still starting up" and "we cannot start at all".
 */
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MsalProvider } from '@azure/msal-react';
import { App } from './App';
import { FullPageSpinner } from './components/FullPageSpinner';
import { Wordmark } from './components/Wordmark';
import { createMsalInstance, entraClientId } from './auth/msal';
import './styles.css';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('index.html is missing <div id="root">.');
}

const root = createRoot(container);

/**
 * The two ways starting up can fail are both configuration mistakes, and both
 * would otherwise show as a blank page with a console error nobody reads.
 */
function StartupError({ title, body }: { title: string; body: ReactNode }): ReactNode {
  return (
    <main className="login">
      <section className="login__card">
        <Wordmark />
        <h1 className="login__title">{title}</h1>
        <div className="alert alert--error" role="alert">
          <p className="alert__body">{body}</p>
        </div>
      </section>
    </main>
  );
}

if (entraClientId.length === 0) {
  /**
   * No client ID yet: render the app anyway, with no `MsalProvider` above it.
   *
   * This is the state the team is in before anyone has registered the Entra
   * app, and it is exactly when the development sign-in bypass has to work.
   * An error page here would hide the very button that exists to get past
   * this, which made the bypass unreachable for its own purpose.
   *
   * Safe because `useMsal` outside a provider returns MSAL's stubbed instance
   * rather than throwing, and the dev path never touches it. Pressing the real
   * sign-in button still explains itself: `AuthProvider` checks
   * `GET /api/auth/config` and reports the missing registration before it
   * reaches MSAL — a more precise message than this file can give, because the
   * server is the side that knows.
   */
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
} else {
  // Something on screen while MSAL reads its cache and the authority metadata.
  root.render(
    <StrictMode>
      <FullPageSpinner label="Starting Class Meet" />
    </StrictMode>,
  );

  void createMsalInstance().then(
    (instance) => {
      root.render(
        <StrictMode>
          <MsalProvider instance={instance}>
            <App />
          </MsalProvider>
        </StrictMode>,
      );
    },
    (error: unknown) => {
      console.error('MSAL failed to initialise:', error);
      root.render(
        <StrictMode>
          <StartupError
            title="Could not reach Microsoft sign-in"
            body={
              <>
                Microsoft Entra ID could not be contacted, or{' '}
                <code>VITE_ENTRA_CLIENT_ID</code> is not a client ID that exists. Check your
                connection and the value in <code>client/.env</code>, then reload.
              </>
            }
          />
        </StrictMode>,
      );
    },
  );
}
