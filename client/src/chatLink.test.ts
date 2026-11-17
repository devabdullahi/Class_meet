import { expect, test } from 'vitest';
import { CHAT_LINK_NOT_ALLOWED, CHAT_LINK_NOT_HTTPS, chatLinkError, chatPlatform } from './chatLink';

// The same cases as server/src/groups/chat-link.test.ts, so the two lists cannot drift apart unnoticed.

test.each([
  'https://groupme.com/join_group/12345678/AbCdEf',
  'https://web.groupme.com/join_group/12345678/AbCdEf',
  'https://discord.gg/abc123',
  'https://discord.com/invite/abc123',
  'https://chat.whatsapp.com/GxQ5Rk1aBcD',
  'https://teams.microsoft.com/l/team/19%3aabc%40thread.tacv2/conversations',
  'https://teams.live.com/l/invite/FEAabc',
  'https://teams.cloud.microsoft/l/chat/0/0?users=x',
])('accepts the invite link %s', (link) => {
  expect(chatLinkError(link)).toBeUndefined();
});

test.each([
  'https://bit.ly/3xKq9Zt',
  'https://tinyurl.com/abc',
  'https://discord.gg.example.com/abc',
  'https://evil-discord.gg/abc',
  'https://www.discord.gg/abc',
  'https://wa.me/15551234567',
  'https://discord.gg:8443/abc',
  'https://discord.gg@example.com/abc',
  'https://user:secret@discord.gg/abc',
  'https://discord.com',
  'https://discord.com/',
])('refuses %s: a shortener, a look-alike, or not an invite', (link) => {
  expect(chatLinkError(link)).toBe(CHAT_LINK_NOT_ALLOWED);
});

test.each(['http://discord.gg/abc', 'discord.gg/abc', 'javascript:alert(1)'])('asks for a whole https link, not %s', (link) => {
  expect(chatLinkError(link)).toBe(CHAT_LINK_NOT_HTTPS);
});

test('names the app a link opens', () => {
  expect(chatPlatform('https://groupme.com/join_group/1/a')).toBe('GroupMe');
  expect(chatPlatform('https://discord.gg/abc')).toBe('Discord');
  expect(chatPlatform('https://chat.whatsapp.com/abc')).toBe('WhatsApp');
  expect(chatPlatform('https://teams.live.com/l/invite/abc')).toBe('Microsoft Teams');
  expect(chatPlatform('https://example.com/abc')).toBeNull();
  expect(chatPlatform('not a link')).toBeNull();
});
