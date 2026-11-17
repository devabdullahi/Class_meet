import { expect, test } from 'vitest';
import { formatLabel, formatMeetingTime, isGroupFull, meetingPlatform, seatsLeft } from './groupFormat';

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

test('counts the seats left, never below zero', () => {
  expect(seatsLeft({ memberCount: 2, maxMembers: 6 })).toBe(4);
  expect(seatsLeft({ memberCount: 7, maxMembers: 6 })).toBe(0);
});

test.each([
  ['https://zoom.us/j/1234567890', 'Zoom'],
  ['https://uta.zoom.us/j/1', 'Zoom'],
  ['https://teams.microsoft.com/l/meetup-join/x', 'Microsoft Teams'],
  ['https://meet.google.com/abc-defg-hij', 'Google Meet'],
  ['https://www.example.org/room', 'example.org'],
  ['not a link', 'Online meeting'],
])('names the platform of %s', (link, expected) => {
  expect(meetingPlatform(link)).toBe(expected);
});
