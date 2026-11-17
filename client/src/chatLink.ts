/**
 * Group chat links: which ones a leader may add, and what platform a link
 * opens. The accepted hosts mirror server/src/groups/chat-link.ts, which
 * stays the authority and documents why each is on the list; this copy
 * exists to explain a rejected link next to the field before saving, and to
 * name the app on the "Open group chat" button.
 */

/** Exact hostnames only, as on the server: no subdomains, so look-alike hosts do not pass. */
const CHAT_PLATFORM_BY_HOST: Readonly<Record<string, string>> = {
  'groupme.com': 'GroupMe',
  'web.groupme.com': 'GroupMe',
  'discord.gg': 'Discord',
  'discord.com': 'Discord',
  'chat.whatsapp.com': 'WhatsApp',
  'teams.microsoft.com': 'Microsoft Teams',
  'teams.live.com': 'Microsoft Teams',
  'teams.cloud.microsoft': 'Microsoft Teams',
};

export const MAX_CHAT_LINK_LENGTH = 300;

export const CHAT_LINK_NOT_HTTPS = 'Paste the full invite link, starting with https://';
export const CHAT_LINK_NOT_ALLOWED =
  'Use an invite link from GroupMe, Discord, WhatsApp or Microsoft Teams. Shortened links can’t be checked.';

/**
 * Why a chat link cannot be saved, or undefined when it can. Expects a
 * trimmed, non-empty link. The server saves the link as the URL parser
 * normalises it ("HTTPS://…" or "https:…" become "https://…"), so the length
 * limit applies to that form here too.
 */
export function chatLinkError(link: string): string | undefined {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return CHAT_LINK_NOT_HTTPS;
  }
  if (url.protocol !== 'https:') return CHAT_LINK_NOT_HTTPS;
  if (url.href.length > MAX_CHAT_LINK_LENGTH) {
    return `The chat link must be ${MAX_CHAT_LINK_LENGTH} characters or fewer.`;
  }
  const onAllowedHost =
    Object.hasOwn(CHAT_PLATFORM_BY_HOST, url.hostname) &&
    url.port === '' &&
    url.username === '' &&
    url.password === '';
  // A bare host ("https://discord.com") is the app's home page, not an invite.
  const hasInvitePath = url.pathname.length > 1;
  return onAllowedHost && hasInvitePath ? undefined : CHAT_LINK_NOT_ALLOWED;
}

/**
 * The app a saved chat link opens ("GroupMe"). Null for a host this list does
 * not name, which only happens if the server's list gains a host first.
 */
export function chatPlatform(link: string): string | null {
  try {
    return CHAT_PLATFORM_BY_HOST[new URL(link).hostname] ?? null;
  } catch {
    return null;
  }
}
