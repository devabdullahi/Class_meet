/**
 * Keeps the number of join requests waiting for the signed-in leader, for the
 * badge on "My groups" in the navigation.
 *
 * It lives above the routes rather than in the layout because every screen
 * renders its own layout: held here, the badge keeps its number while the
 * next screen loads instead of disappearing and reappearing. The count is
 * fetched again on every navigation and whenever a screen calls `refresh`
 * (Group Details does after the leader answers a request). There is no
 * polling: a new request shows up the next time the leader moves around.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/useAuth';
import { PendingRequestsContext, type PendingRequestsContextValue } from './pending-requests-context';

export function PendingRequestsProvider({ children }: { children: ReactNode }): ReactNode {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [refreshCount, setRefreshCount] = useState(0);
  const signedInUserId = user?.id ?? null;

  useEffect(() => {
    if (signedInUserId === null) {
      setPendingRequestCount(0);
      return undefined;
    }
    let cancelled = false;
    api.fetchPendingRequestCount().then(
      (result) => {
        if (!cancelled) setPendingRequestCount(result.pendingRequestCount);
      },
      () => {
        // The badge is a hint, not the screen's content. If the count cannot
        // be fetched, the last one stays; the open screen reports its own
        // failures, and the next navigation tries again.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [signedInUserId, pathname, refreshCount]);

  const refresh = useCallback(() => setRefreshCount((count) => count + 1), []);
  const value = useMemo<PendingRequestsContextValue>(
    () => ({ pendingRequestCount, refresh }),
    [pendingRequestCount, refresh],
  );

  return <PendingRequestsContext.Provider value={value}>{children}</PendingRequestsContext.Provider>;
}
