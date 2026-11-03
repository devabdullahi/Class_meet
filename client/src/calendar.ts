/**
 * Turns a study group's weekly meeting into a calendar event, either as an
 * .ics file (works with Apple, Outlook and Google Calendar) or as a link that
 * opens Google Calendar's "new event" form.
 *
 * Everything here is pure: pass in the current time and get text back, so it
 * can be tested without a browser. Downloading the file is `download.ts`.
 *
 * Times are "floating" local times (no time zone attached), so the event shows
 * at the same wall-clock time the group meets, in the student's own calendar.
 * The Create Group form says the meeting time is local time for the same reason.
 */
import type { GroupFormat, MeetingDay } from './api';

/** The Create Group form has no end time, so every event is this long. */
export const MEETING_DURATION_MINUTES = 60;

export interface CalendarEventInput {
  groupId: string;
  courseCode: string;
  goal: string;
  meetingDay: MeetingDay;
  /** "HH:MM", 24-hour. */
  meetingTime: string;
  format: GroupFormat;
  /** A place, or a meeting link for online groups. */
  location: string;
}

const DAY_INDEX: Record<MeetingDay, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

const ICS_DAY_CODE: Record<MeetingDay, string> = {
  Sunday: 'SU',
  Monday: 'MO',
  Tuesday: 'TU',
  Wednesday: 'WE',
  Thursday: 'TH',
  Friday: 'FR',
  Saturday: 'SA',
};

/** The first meeting that has not started yet, as a local Date. */
export function nextOccurrence(day: MeetingDay, time: string, now: Date): Date {
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  const daysAhead = (DAY_INDEX[day] - now.getDay() + 7) % 7;
  start.setDate(start.getDate() + daysAhead);
  if (start.getTime() <= now.getTime()) {
    start.setDate(start.getDate() + 7);
  }
  return start;
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/** 20261103T143000 */
function formatLocal(date: Date): string {
  return (
    `${pad(date.getFullYear(), 4)}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/** 20261103T203000Z */
function formatUtc(date: Date): string {
  return (
    `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

function eventTimes(event: CalendarEventInput, now: Date): { start: Date; end: Date } {
  const start = nextOccurrence(event.meetingDay, event.meetingTime, now);
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + MEETING_DURATION_MINUTES);
  return { start, end };
}

function summaryOf(event: CalendarEventInput): string {
  return `${event.courseCode} study group`;
}

function weeklyRule(event: CalendarEventInput): string {
  return `FREQ=WEEKLY;BYDAY=${ICS_DAY_CODE[event.meetingDay]}`;
}

/** RFC 5545 text escaping: backslash, semicolon, comma and line breaks. */
function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

const MAX_LINE_OCTETS = 75;
const encoder = new TextEncoder();

/** RFC 5545 lines are at most 75 octets; longer ones continue after CRLF + space. */
function foldLine(line: string): string {
  if (encoder.encode(line).length <= MAX_LINE_OCTETS) return line;
  const parts: string[] = [];
  let current = '';
  let octets = 0;
  let limit = MAX_LINE_OCTETS;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (octets + size > limit) {
      parts.push(current);
      current = '';
      octets = 0;
      // Continuation lines begin with one space, which counts toward the limit.
      limit = MAX_LINE_OCTETS - 1;
    }
    current += character;
    octets += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

export function buildIcs(event: CalendarEventInput, now: Date = new Date()): string {
  const { start, end } = eventTimes(event, now);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Class Meet//Study Groups//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.groupId}@classmeet`,
    `DTSTAMP:${formatUtc(now)}`,
    `DTSTART:${formatLocal(start)}`,
    `DTEND:${formatLocal(end)}`,
    `RRULE:${weeklyRule(event)}`,
    `SUMMARY:${escapeIcsText(summaryOf(event))}`,
    `DESCRIPTION:${escapeIcsText(event.goal)}`,
    `LOCATION:${escapeIcsText(event.location)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

export function googleCalendarUrl(event: CalendarEventInput, now: Date = new Date()): string {
  const { start, end } = eventTimes(event, now);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: summaryOf(event),
    dates: `${formatLocal(start)}/${formatLocal(end)}`,
    details: event.goal,
    location: event.location,
    recur: `RRULE:${weeklyRule(event)}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function icsFileName(event: CalendarEventInput): string {
  return `${event.courseCode.replace(/\s+/g, '-')}-study-group.ics`;
}
