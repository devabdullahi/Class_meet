/**
 * The Entra app registration's client ID, compiled in from client/.env.
 *
 * In a file of its own, away from `msal.ts`, so the login page can read it
 * without importing MSAL: `msal.ts` is loaded on demand, only when the server
 * says Microsoft sign-in is on (see AuthProvider).
 */
export const entraClientId: string = (import.meta.env.VITE_ENTRA_CLIENT_ID ?? '').trim();
