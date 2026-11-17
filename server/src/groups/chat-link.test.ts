import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAT_LINK_NOT_ALLOWED, CHAT_LINK_NOT_HTTPS, MAX_CHAT_LINK_LENGTH, chatLinkProblem } from './chat-link.js';

test('accepts invite links from GroupMe, Discord, WhatsApp and Microsoft Teams', () => {
  for (const link of [
    'https://groupme.com/join_group/12345678/AbCdEf',
    'https://web.groupme.com/join_group/12345678/AbCdEf',
    'https://discord.gg/abc123',
    'https://discord.com/invite/abc123',
    'https://chat.whatsapp.com/GxQ5Rk1aBcD',
    'https://teams.microsoft.com/l/team/19%3aabc%40thread.tacv2/conversations',
    'https://teams.live.com/l/invite/FEAabc',
    'https://teams.cloud.microsoft/l/chat/0/0?users=x',
  ]) {
    assert.equal(chatLinkProblem(link), null, link);
  }
});

test('refuses link shorteners with the message the leader sees', () => {
  assert.equal(chatLinkProblem('https://bit.ly/3xKq9Zt'), CHAT_LINK_NOT_ALLOWED);
  assert.equal(chatLinkProblem('https://tinyurl.com/abc'), CHAT_LINK_NOT_ALLOWED);
  assert.match(CHAT_LINK_NOT_ALLOWED, /Shortened links can’t be checked\.$/);
});

test('refuses look-alike hosts, other subdomains, ports and user:password@ links', () => {
  for (const link of [
    'https://discord.gg.example.com/abc',
    'https://evil-discord.gg/abc',
    'https://www.discord.gg/abc',
    'https://wa.me/15551234567',
    'https://discord.gg:8443/abc',
    'https://discord.gg@example.com/abc',
    'https://user:secret@discord.gg/abc',
  ]) {
    assert.equal(chatLinkProblem(link), CHAT_LINK_NOT_ALLOWED, link);
  }
});

test('refuses a bare app address, which is not an invite', () => {
  assert.equal(chatLinkProblem('https://discord.com'), CHAT_LINK_NOT_ALLOWED);
  assert.equal(chatLinkProblem('https://discord.com/'), CHAT_LINK_NOT_ALLOWED);
});

test('asks for https, and for a whole link', () => {
  assert.equal(chatLinkProblem('http://discord.gg/abc'), CHAT_LINK_NOT_HTTPS);
  assert.equal(chatLinkProblem('discord.gg/abc'), CHAT_LINK_NOT_HTTPS);
  assert.equal(chatLinkProblem('javascript:alert(1)'), CHAT_LINK_NOT_HTTPS);
});

test('refuses an over-long link', () => {
  const link = `https://discord.gg/${'a'.repeat(MAX_CHAT_LINK_LENGTH)}`;
  assert.match(chatLinkProblem(link) ?? '', /characters or fewer/);
});
