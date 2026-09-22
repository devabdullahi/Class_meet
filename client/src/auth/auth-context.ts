import { createContext } from 'react';
import type { AuthConfigResponse, AuthUser } from '../api';

export type AuthStatus = 'loading' | 'signed-in' | 'signed-out';

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  /** The last sign-in failure, e.g. an account from the wrong tenant. */
  error: string | null;
  /**
   * `GET /api/auth/config`, or null while it is loading or if the API could
   * not be reached. Sign-in needs it, so the login page waits for it.
   */
  config: AuthConfigResponse | null;
  /** Runs the whole Microsoft sign-in and adopts the resulting session. */
  signIn: () => Promise<void>;
  /**
   * DEVELOPMENT SIGN-IN BYPASS — REMOVE BEFORE THE PILOT. Only ever called
   * from the button the login page shows when `config.devLoginEnabled`.
   */
  devSignIn: () => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
