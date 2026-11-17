/**
 * What a student may see of a group they are not in.
 *
 * An online group's meeting link is shared with its members only. Anyone
 * holding the link can walk into the call, so showing it to outsiders would
 * make "Request to join" pointless. An in-person place stays visible: it is
 * how a student decides whether a group meets somewhere they can get to.
 */
import type { GroupFormat } from './validation.js';

export function visibleLocation(
  format: GroupFormat,
  location: string,
  viewerRole: 'leader' | 'member' | 'none',
): string | null {
  return format === 'online' && viewerRole === 'none' ? null : location;
}
