/**
 * Route guard. Signed-out visitors are sent to /login, remembering where they
 * were headed so sign-in can return them there.
 */
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';
import { FullPageSpinner } from '../components/FullPageSpinner';

export function RequireAuth({ children }: { children: ReactNode }): ReactNode {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <FullPageSpinner label="Checking your session" />;
  }

  if (status === 'signed-out') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
