/**
 * Whether the signed-in student is a moderator, and how many groups and
 * members wait in the reports queue, for the Reports item in the navigation.
 *
 * The server decides: there is no moderator flag on the session or the user
 * the client holds, so nothing in the browser can switch the item on. Like
 * the join-request badge it is kept above the routes and asked again on every
 * navigation and whenever a screen calls `refresh`.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/useAuth';
import { ModerationStatusContext, type ModerationStatusContextValue } from './moderation-status-context';

export function ModerationStatusProvider({ children }: { children: ReactNode }): ReactNode {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [isModerator, setIsModerator] = useState(false);
  const [openCount, setOpenCount] = useState(0);
  const [refreshCount, setRefreshCount] = useState(0);
  const signedInUserId = user?.id ?? null;

  useEffect(() => {
    if (signedInUserId === null) {
      setIsModerator(false);
      setOpenCount(0);
      return undefined;
    }
    let cancelled = false;
    api.fetchModerationStatus().then(
      (status) => {
        if (cancelled) return;
        setIsModerator(status.isModerator);
        setOpenCount(status.openCount ?? 0);
      },
      () => {
        // The item is a way in, not the screen's content. If the status
        // cannot be fetched the last answer stays, and the next navigation
        // asks again; the Reports page itself is guarded by the server.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [signedInUserId, pathname, refreshCount]);

  const refresh = useCallback(() => setRefreshCount((count) => count + 1), []);
  const value = useMemo<ModerationStatusContextValue>(
    () => ({ isModerator, openCount, refresh }),
    [isModerator, openCount, refresh],
  );

  return <ModerationStatusContext.Provider value={value}>{children}</ModerationStatusContext.Provider>;
}
