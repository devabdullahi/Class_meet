/**
 * Which group chat links a leader may add.
 *
 * Members open the link straight from the group's page, so it must lead
 * where it says. Only invite links on these exact hosts are accepted (no
 * subdomains of them, no other ports, no user:password@ part):
 *
 *   GroupMe          groupme.com, web.groupme.com    (…/join_group/…)
 *   Discord          discord.gg, discord.com          (discord.gg/…, discord.com/invite/…)
 *   WhatsApp         chat.whatsapp.com                (group invites; wa.me is left out
 *                                                      because it opens a chat with one
 *                                                      person's phone number, not a group)
 *   Microsoft Teams  teams.microsoft.com, teams.live.com, teams.cloud.microsoft
 *
 * Link shorteners (bit.ly and the like) are refused by not being on the list:
 * where they lead cannot be checked, and can be changed after the check.
 *
 * The client mirrors this list (client/src/chatLink.ts) to explain a problem
 * before saving; this module stays the authority.
 */

export const CHAT_LINK_HOSTS: ReadonlySet<string> = new Set([
  'groupme.com',
  'web.groupme.com',
  'discord.gg',
  'discord.com',
  'chat.whatsapp.com',
  'teams.microsoft.com',
  'teams.live.com',
  'teams.cloud.microsoft',
]);

export const MAX_CHAT_LINK_LENGTH = 300;

export const CHAT_LINK_NOT_HTTPS = 'Paste the full invite link, starting with https://';
export const CHAT_LINK_NOT_ALLOWED =
  'Use an invite link from GroupMe, Discord, WhatsApp or Microsoft Teams. Shortened links can’t be checked.';

/** Why a chat link cannot be saved, or null when it can. Expects a trimmed, non-empty link. */
export function chatLinkProblem(link: string): string | null {
  if (link.length > MAX_CHAT_LINK_LENGTH) {
    return `The chat link must be ${MAX_CHAT_LINK_LENGTH} characters or fewer.`;
  }
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return CHAT_LINK_NOT_HTTPS;
  }
  if (url.protocol !== 'https:') return CHAT_LINK_NOT_HTTPS;
  const onAllowedHost =
    CHAT_LINK_HOSTS.has(url.hostname) && url.port === '' && url.username === '' && url.password === '';
  // A bare host ("https://discord.com") is the app's home page, not an invite.
  const hasInvitePath = url.pathname.length > 1;
  return onAllowedHost && hasInvitePath ? null : CHAT_LINK_NOT_ALLOWED;
}
