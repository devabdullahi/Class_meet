import { expect, test } from 'vitest';
import {
  formatLabel,
  formatMeetingTime,
  groupGoalLine,
  groupTitle,
  isGroupFull,
  meetingPlaceLabel,
  meetingPlatform,
  seatsLeft,
  sortByNextMeeting,
} from './groupFormat';

test.each([
  ['00:05', '12:05 AM'],
  ['09:00', '9:00 AM'],
  ['12:00', '12:00 PM'],
  ['14:30', '2:30 PM'],
  ['23:59', '11:59 PM'],
])('formats %s as %s', (input, expected) => {
  expect(formatMeetingTime(input)).toBe(expected);
});

test('a group is titled by its name, with its goal as the line under it', () => {
  const named = { name: 'Midterm crew', goal: 'Review SOLID' };
  expect(groupTitle(named)).toBe('Midterm crew');
  expect(groupGoalLine(named)).toBe('Review SOLID');
});

test('a group from before names existed is titled by its goal, with no second line', () => {
  const unnamed = { name: null, goal: 'Review SOLID' };
  expect(groupTitle(unnamed)).toBe('Review SOLID');
  expect(groupGoalLine(unnamed)).toBeNull();
});

test('labels the two formats', () => {
  expect(formatLabel('online')).toBe('Online');
  expect(formatLabel('in_person')).toBe('In person');
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

test('sorts groups by their next meeting, counting from now', () => {
  // Wednesday 4 November 2026, 17:00.
  const now = new Date(2026, 10, 4, 17, 0);
  const groups = [
    { id: 'tue', meetingDay: 'Tuesday' as const, meetingTime: '09:00' },
    { id: 'wed-past', meetingDay: 'Wednesday' as const, meetingTime: '16:00' },
    { id: 'wed-later', meetingDay: 'Wednesday' as const, meetingTime: '18:00' },
    { id: 'fri', meetingDay: 'Friday' as const, meetingTime: '12:30' },
  ];
  expect(sortByNextMeeting(groups, now).map((group) => group.id)).toEqual(['wed-later', 'fri', 'tue', 'wed-past']);
});

test('names the place, or the platform only when the meeting link is visible', () => {
  expect(meetingPlaceLabel({ format: 'in_person', location: 'ERB 129' })).toBe('ERB 129');
  expect(meetingPlaceLabel({ format: 'online', location: 'https://zoom.us/j/1' })).toBe('Online · Zoom');
  expect(meetingPlaceLabel({ format: 'online', location: null })).toBe('Online');
});
