/**
 * Holds the one piece of global state the app has: who is signed in.
 *
 * On mount it asks the server two things: who am I (`/api/auth/me`) and how do
 * I talk to Microsoft (`/api/auth/config`). There is no token in localStorage
 * to read — the Class Meet session lives in an httpOnly cookie the page cannot
 * see — so the server is the only source of truth, which also means a session
 * revoked server-side is noticed on the next load rather than trusted forever.
 *
 * The Microsoft half of sign-in lives here rather than in the button, because
 * signing *out* needs MSAL too and one component should own that instance.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMsal } from '@azure/msal-react';
import { AuthError } from '@azure/msal-browser';
import { api, ApiError, type AuthConfigResponse, type AuthUser } from '../api';
import { AuthContext, type AuthContextValue, type AuthStatus } from './auth-context';
import { entraClientId } from './msal';

/**
 * MSAL reports ordinary user behaviour as an error. Closing the popup is not
 * something to shout about; a blocked popup is, because the user has to do
 * something about it.
 */
function describeMsalFailure(error: AuthError): string | null {
  switch (error.errorCode) {
    case 'user_cancelled':
      // They closed the window or pressed Back. Leave the page as it was.
      return null;
    case 'popup_window_error':
    case 'empty_window_error':
      return (
        'Your browser blocked the Microsoft sign-in window. Allow pop-ups for this site and ' +
        'try again.'
      );
    case 'interaction_in_progress':
      return 'A sign-in is already open. Finish or close that window, then try again.';
    default:
      return (
        error.errorMessage.length > 0
          ? `Microsoft sign-in failed: ${error.errorMessage}`
          : 'Microsoft sign-in failed. Please try again.'
      );
  }
}

export function AuthProvider({ children }: { children: ReactNode }): ReactNode {
  const { instance } = useMsal();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<AuthConfigResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      // Deliberately not awaited in sequence: a 401 from /me must not stop the
      // login page from learning how to sign in.
      const [me, authConfig] = await Promise.allSettled([api.fetchMe(), api.fetchAuthConfig()]);
      if (cancelled) return;

      if (authConfig.status === 'fulfilled') {
        setConfig(authConfig.value);
      } else {
        // The login page renders a "cannot reach the server" state from
        // config === null, so there is nothing to report twice.
        console.warn('Could not load /api/auth/config:', authConfig.reason);
      }

      if (me.status === 'fulfilled') {
        setUser(me.value.user);
        setStatus('signed-in');
        return;
      }

      setUser(null);
      setStatus('signed-out');
      // A 401 is the normal "not signed in" answer, not a problem to report.
      if (me.reason instanceof ApiError && !me.reason.isUnauthenticated) {
        setError(me.reason.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (): Promise<void> => {
    setError(null);

    if (config === null) {
      setError(
        'Could not reach the Class Meet server, so sign-in cannot start. Check that the API is ' +
          'running and reload the page.',
      );
      return;
    }
    if (!config.configured) {
      setError(
        'The Class Meet server has no Entra app registration configured. Set ENTRA_CLIENT_ID in ' +
          'server/.env and restart it.',
      );
      return;
    }
    // Catching this here turns the classic "the two client IDs drifted apart"
    // bug into a sentence, instead of a 401 from a token with the wrong `aud`.
    if (config.clientId !== entraClientId) {
      setError(
        'The client ID in client/.env does not match the one in server/.env, so Microsoft would ' +
          'issue a token this server refuses. Make both ENTRA_CLIENT_ID and VITE_ENTRA_CLIENT_ID ' +
          'the Application (client) ID from the Azure portal.',
      );
      return;
    }

    try {
      // Authorization code + PKCE, run entirely by MSAL. The scope is our own
      // API's, so the token that comes back is one this server will accept —
      // Microsoft's rule is that an API accepts only tokens whose `aud` is its
      // own, which an ID token or a Graph token would fail.
      const result = await instance.loginPopup({ scopes: [config.apiScope] });
      instance.setActiveAccount(result.account);

      const { user: signedIn } = await api.signInWithEntra(result.accessToken);
      setUser(signedIn);
      setStatus('signed-in');
      setError(null);
    } catch (caught) {
      setUser(null);
      setStatus('signed-out');

      if (caught instanceof ApiError) {
        // Our own server refused: a wrong tenant, a missing scope, no
        // database. Its message is written to be shown.
        setError(caught.message);
        return;
      }
      if (caught instanceof AuthError) {
        setError(describeMsalFailure(caught));
        return;
      }
      console.error('Unexpected sign-in failure:', caught);
      setError('Sign-in failed. Please try again.');
    }
  }, [config, instance]);

  /**
   * DEVELOPMENT SIGN-IN BYPASS — REMOVE BEFORE THE PILOT. No MSAL, no token,
   * no database: it asks the server for a session for its own fake student.
   * The server refuses unless it is explicitly enabled, so this failing with a
   * 403 is the expected outcome everywhere but a teammate's laptop.
   */
  const devSignIn = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const { user: signedIn } = await api.devLogin();
      setUser(signedIn);
      setStatus('signed-in');
    } catch (caught) {
      setUser(null);
      setStatus('signed-out');
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'The development sign-in could not be completed.',
      );
    }
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    try {
      await api.logout();
    } catch (caught) {
      // The cookie may well be gone anyway; log it and sign out locally so the
      // user is never stuck on a screen they asked to leave.
      console.warn('Logout request failed:', caught);
    } finally {
      // Drops MSAL's cached tokens for this tab. Deliberately NOT
      // `logoutPopup`: that ends the user's Microsoft session everywhere,
      // which from a study-group app is a startling thing to do to someone's
      // Outlook. Leaving Class Meet should leave Class Meet.
      try {
        await instance.clearCache();
      } catch (caught) {
        console.warn('Could not clear the MSAL cache:', caught);
      }
      setUser(null);
      setStatus('signed-out');
      setError(null);
    }
  }, [instance]);

  const clearError = useCallback((): void => setError(null), []);

  const value = useMemo<AuthContextValue>(
    // `devSignIn`: DEVELOPMENT SIGN-IN BYPASS — REMOVE BEFORE THE PILOT.
    () => ({ status, user, error, config, signIn, devSignIn, signOut, clearError }),
    [status, user, error, config, signIn, devSignIn, signOut, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
