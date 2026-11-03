import { expect, test } from 'vitest';
import {
  MEETING_DURATION_MINUTES,
  buildIcs,
  googleCalendarUrl,
  icsFileName,
  nextOccurrence,
  type CalendarEventInput,
} from './calendar';

// Monday 2 November 2026, 10:00 local time.
const NOW = new Date(2026, 10, 2, 10, 0, 0);

const EVENT: CalendarEventInput = {
  groupId: '9a8b7c6d-1111-4222-8333-444455556666',
  courseCode: 'CSE 3311',
  goal: 'Review SOLID, patterns; and UML',
  meetingDay: 'Tuesday',
  meetingTime: '14:30',
  format: 'in_person',
  location: 'Central Library, Room 412',
};

test('nextOccurrence picks the coming day this week', () => {
  const next = nextOccurrence('Tuesday', '14:30', NOW);
  expect([next.getFullYear(), next.getMonth(), next.getDate()]).toEqual([2026, 10, 3]);
  expect([next.getHours(), next.getMinutes()]).toEqual([14, 30]);
});

test('nextOccurrence uses today when the meeting is later today', () => {
  expect(nextOccurrence('Monday', '15:00', NOW).getDate()).toBe(2);
});

test('nextOccurrence moves a meeting that already started to next week', () => {
  expect(nextOccurrence('Monday', '09:00', NOW).getDate()).toBe(9);
  expect(nextOccurrence('Monday', '10:00', NOW).getDate()).toBe(9);
});

test('nextOccurrence wraps past the end of the month', () => {
  const next = nextOccurrence('Sunday', '08:00', new Date(2026, 10, 28, 12, 0, 0));
  expect([next.getMonth(), next.getDate()]).toEqual([10, 29]);
  const wrapped = nextOccurrence('Tuesday', '08:00', new Date(2026, 10, 28, 12, 0, 0));
  expect([wrapped.getMonth(), wrapped.getDate()]).toEqual([11, 1]);
});

test('the .ics file describes a weekly event with the group details', () => {
  const ics = buildIcs(EVENT, NOW);
  expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
  expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  expect(ics).toContain('DTSTART:20261103T143000\r\n');
  expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=TU\r\n');
  expect(ics).toContain('SUMMARY:CSE 3311 study group\r\n');
  expect(ics).toContain('UID:9a8b7c6d-1111-4222-8333-444455556666@classmeet\r\n');
});

test('the event lasts the standard meeting length', () => {
  expect(MEETING_DURATION_MINUTES).toBe(60);
  expect(buildIcs(EVENT, NOW)).toContain('DTEND:20261103T153000\r\n');
});

test('commas and semicolons in text are escaped', () => {
  const ics = buildIcs(EVENT, NOW);
  expect(ics).toContain('DESCRIPTION:Review SOLID\\, patterns\; and UML\r\n');
  expect(ics).toContain('LOCATION:Central Library\\, Room 412\r\n');
});

test('long lines are folded at 75 octets with a leading space', () => {
  const ics = buildIcs({ ...EVENT, goal: 'x'.repeat(200) }, NOW);
  for (const line of ics.split('\r\n')) {
    expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  }
  expect(ics).toMatch(/\r\n x+/);
});

test('every line ends with CRLF and nothing uses a bare newline', () => {
  expect(buildIcs(EVENT, NOW).replace(/\r\n/g, '')).not.toContain('\n');
});

test('the Google Calendar link carries the title, time, place and weekly repeat', () => {
  const url = new URL(googleCalendarUrl(EVENT, NOW));
  expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
  expect(url.searchParams.get('text')).toBe('CSE 3311 study group');
  expect(url.searchParams.get('dates')).toBe('20261103T143000/20261103T153000');
  expect(url.searchParams.get('location')).toBe('Central Library, Room 412');
  expect(url.searchParams.get('recur')).toBe('RRULE:FREQ=WEEKLY;BYDAY=TU');
});

test('the file name is safe and readable', () => {
  expect(icsFileName(EVENT)).toBe('CSE-3311-study-group.ics');
});
