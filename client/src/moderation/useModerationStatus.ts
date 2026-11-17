import { useContext } from 'react';
import { ModerationStatusContext, type ModerationStatusContextValue } from './moderation-status-context';

export function useModerationStatus(): ModerationStatusContextValue {
  return useContext(ModerationStatusContext);
}
