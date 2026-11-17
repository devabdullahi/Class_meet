import { createContext } from 'react';
import type { AuthConfigResponse, AuthUser } from '../api';

export type AuthStatus = 'loading' | 'signed-in' | 'signed-out';

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  /** The last Microsoft or development sign-in failure. Email sign-in reports its own, by its fields. */
  error: string | null;
  /**
   * `GET /api/auth/config`, or null while it is loading or if the API could
   * not be reached. It says which sign-in methods the login page offers.
   */
  config: AuthConfigResponse | null;
  /**
   * Checks an emailed code and adopts the resulting session. Rejects with the
   * server's ApiError (a wrong or expired code), for the form to show.
   */
  signInWithEmailCode: (email: string, code: string) => Promise<void>;
  /** Runs the whole Microsoft sign-in, when `config.microsoftLoginEnabled`. */
  signInWithMicrosoft: () => Promise<void>;
  /**
   * DEVELOPMENT SIGN-IN BYPASS — REMOVE BEFORE THE PILOT. Only ever called
   * from the button the login page shows when `config.devLoginEnabled`.
   */
  devSignIn: () => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
