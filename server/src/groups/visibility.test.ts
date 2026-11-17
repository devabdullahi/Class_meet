import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleChatLink, visibleLocation } from './visibility.js';

const LINK = 'https://zoom.us/j/1234567890';

test('a student outside an online group does not get its meeting link', () => {
  assert.equal(visibleLocation('online', LINK, 'none'), null);
});

test('members and the leader of an online group get its meeting link', () => {
  assert.equal(visibleLocation('online', LINK, 'member'), LINK);
  assert.equal(visibleLocation('online', LINK, 'leader'), LINK);
});

test('an in-person meeting place is visible to everyone', () => {
  assert.equal(visibleLocation('in_person', 'ERB 129', 'none'), 'ERB 129');
});

const CHAT = 'https://chat.whatsapp.com/GxQ5Rk1aBcD';

test('a group chat link is shared with members and the leader only', () => {
  assert.equal(visibleChatLink(CHAT, 'member'), CHAT);
  assert.equal(visibleChatLink(CHAT, 'leader'), CHAT);
  // 'none' covers outsiders and students whose request is still pending.
  assert.equal(visibleChatLink(CHAT, 'none'), null);
});

test('a group without a chat has no link for anyone', () => {
  assert.equal(visibleChatLink(null, 'member'), null);
});
