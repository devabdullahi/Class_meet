import { expect, test } from 'vitest';
import { formatLabel, formatMeetingTime, isGroupFull } from './groupFormat';

test.each([
  ['00:05', '12:05 AM'],
  ['09:00', '9:00 AM'],
  ['12:00', '12:00 PM'],
  ['14:30', '2:30 PM'],
  ['23:59', '11:59 PM'],
])('formats %s as %s', (input, expected) => {
  expect(formatMeetingTime(input)).toBe(expected);
});

test('labels the two formats', () => {
  expect(formatLabel('online')).toBe('Online');
  expect(formatLabel('in_person')).toBe('In Person');
});

test('a group is full when it reaches its maximum', () => {
  expect(isGroupFull({ memberCount: 5, maxMembers: 6 })).toBe(false);
  expect(isGroupFull({ memberCount: 6, maxMembers: 6 })).toBe(true);
});
