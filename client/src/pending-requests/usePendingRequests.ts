import { useContext } from 'react';
import { PendingRequestsContext, type PendingRequestsContextValue } from './pending-requests-context';

export function usePendingRequests(): PendingRequestsContextValue {
  return useContext(PendingRequestsContext);
}
