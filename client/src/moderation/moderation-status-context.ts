import { createContext } from 'react';

export interface ModerationStatusContextValue {
  /** Whether the server says the signed-in student is a moderator. */
  isModerator: boolean;
  /** Groups and members with open reports; 0 for anyone but a moderator. */
  openCount: number;
  /** Ask again, e.g. right after a moderator resolves a report. */
  refresh: () => void;
}

/**
 * Outside <ModerationStatusProvider> nobody is a moderator, so the navigation
 * leaves Reports out. Screens stay renderable on their own, as their tests do.
 */
export const ModerationStatusContext = createContext<ModerationStatusContextValue>({
  isModerator: false,
  openCount: 0,
  refresh: () => undefined,
});
