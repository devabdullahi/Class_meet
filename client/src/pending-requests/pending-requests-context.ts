import { createContext } from 'react';

export interface PendingRequestsContextValue {
  /** Join requests waiting across every group the signed-in student leads. */
  pendingRequestCount: number;
  /** Fetch the count again, e.g. right after the leader answers a request. */
  refresh: () => void;
}

/**
 * Outside <PendingRequestsProvider> there is no count to show, so the
 * navigation simply shows no badge. That keeps screens renderable on their
 * own (as their tests do) without pretending to know a number.
 */
export const PendingRequestsContext = createContext<PendingRequestsContextValue>({
  pendingRequestCount: 0,
  refresh: () => undefined,
});
