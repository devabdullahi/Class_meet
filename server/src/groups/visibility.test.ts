import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleLocation } from './visibility.js';

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
