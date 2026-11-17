/**
 * What a student may see of a group they are not in.
 *
 * An online group's meeting link is shared with its members only. Anyone
 * holding the link can walk into the call, so showing it to outsiders would
 * make "Request to join" pointless. An in-person place stays visible: it is
 * how a student decides whether a group meets somewhere they can get to.
 *
 * The group chat's invite link is members-only for the same reason. Others
 * may know that a chat exists (GroupSummary.hasChatLink), not how to get in.
 * A student whose request is still pending is not a member yet.
 */
import type { GroupFormat } from './validation.js';

type ViewerRole = 'leader' | 'member' | 'none';

export function visibleLocation(
  format: GroupFormat,
  location: string,
  viewerRole: ViewerRole,
): string | null {
  return format === 'online' && viewerRole === 'none' ? null : location;
}

export function visibleChatLink(chatLink: string | null, viewerRole: ViewerRole): string | null {
  return viewerRole === 'none' ? null : chatLink;
}
