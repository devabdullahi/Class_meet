/**
 * Holds the one piece of global state the app has: who is signed in.
 *
 * On mount it asks the server two things: who am I (`/api/auth/me`) and how
 * may I sign in (`/api/auth/config`). There is no token in localStorage to
 * read — the Class Meet session lives in an httpOnly cookie the page cannot
 * see — so the server is the only source of truth, which also means a session
 * revoked server-side is noticed on the next load rather than trusted forever.
 *
 * Students sign in with a code emailed to their UTA address. Microsoft
 * sign-in is kept for when UTA approves the app, and MSAL is loaded only if
 * the server says it is on: until then no visitor downloads or initialises
 * it. It lives here rather than in the button because signing *out* needs
 * MSAL too, and one component should own that instance.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { IPublicClientApplication } from '@azure/msal-browser';
import { api, ApiError, setSessionExpiredHandler, type AuthConfigResponse, type AuthUser } from '../api';
import { AuthContext, type AuthContextValue, type AuthStatus } from './auth-context';
import { entraClientId } from './entraClientId';

interface MicrosoftClient {
  msal: typeof import('./msal');
  instance: IPublicClientApplication;
}

export function AuthProvider({ children }: { children: ReactNode }): ReactNode {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<AuthConfigResponse | null>(null);
  // Null until the server enables Microsoft sign-in; then MSAL, loading.
  const microsoftClient = useRef<Promise<MicrosoftClient> | null>(null);

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
        // The email form still renders without it; asking for a code then
        // reports that the server cannot be reached, where the student looks.
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

  /**
   * Starts loading MSAL as soon as the server offers Microsoft sign-in, not
   * when the button is pressed: the popup must open while the click still
   * counts as a user gesture, or the browser blocks it.
   */
  useEffect(() => {
    if (config?.microsoftLoginEnabled !== true || entraClientId.length === 0) return;
    if (microsoftClient.current !== null) return;
    const loading = import('./msal').then(async (msal) => ({ msal, instance: await msal.createMsalInstance() }));
    loading.catch((caught: unknown) => console.error('MSAL failed to initialise:', caught));
    microsoftClient.current = loading;
  }, [config]);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      setStatus('signed-out');
    });
    return () => setSessionExpiredHandler(null);
  }, []);

  const signInWithEmailCode = useCallback(async (email: string, code: string): Promise<void> => {
    const { user: signedIn } = await api.verifyEmailCode(email, code);
    setUser(signedIn);
    setStatus('signed-in');
    setError(null);
  }, []);

  const signInWithMicrosoft = useCallback(async (): Promise<void> => {
    setError(null);

    if (config === null || !config.microsoftLoginEnabled) {
      setError('Microsoft sign-in is not available. Sign in with the code we email to your UTA address.');
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
    const loading = microsoftClient.current;
    if (loading === null) {
      setError('Microsoft sign-in is still loading. Try again in a moment.');
      return;
    }

    let microsoft: MicrosoftClient;
    try {
      microsoft = await loading;
    } catch {
      setError(
        'Could not reach Microsoft sign-in. Check your connection, or that VITE_ENTRA_CLIENT_ID is ' +
          'a client ID that exists, then reload.',
      );
      return;
    }

    try {
      // Authorization code + PKCE, run entirely by MSAL. The scope is our own
      // API's, so the token that comes back is one this server will accept —
      // Microsoft's rule is that an API accepts only tokens whose `aud` is its
      // own, which an ID token or a Graph token would fail.
      const result = await microsoft.instance.loginPopup({ scopes: [config.apiScope] });
      microsoft.instance.setActiveAccount(result.account);

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
      if (microsoft.msal.isMsalError(caught)) {
        setError(microsoft.msal.describeMsalFailure(caught));
        return;
      }
      console.error('Unexpected sign-in failure:', caught);
      setError('Sign-in failed. Please try again.');
    }
  }, [config]);

  /**
   * DEVELOPMENT SIGN-IN BYPASS — REMOVE BEFORE THE PILOT. No code, no token,
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
      // Drops MSAL's cached tokens for this tab, if MSAL was ever loaded.
      // Deliberately NOT `logoutPopup`: that ends the user's Microsoft
      // session everywhere, which from a study-group app is a startling thing
      // to do to someone's Outlook. Leaving Class Meet should leave Class Meet.
      const loading = microsoftClient.current;
      if (loading !== null) {
        try {
          await (await loading).instance.clearCache();
        } catch (caught) {
          console.warn('Could not clear the MSAL cache:', caught);
        }
      }
      setUser(null);
      setStatus('signed-out');
      setError(null);
    }
  }, []);

  const clearError = useCallback((): void => setError(null), []);

  const value = useMemo<AuthContextValue>(
    // `devSignIn`: DEVELOPMENT SIGN-IN BYPASS — REMOVE BEFORE THE PILOT.
    () => ({ status, user, error, config, signInWithEmailCode, signInWithMicrosoft, devSignIn, signOut, clearError }),
    [status, user, error, config, signInWithEmailCode, signInWithMicrosoft, devSignIn, signOut, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
