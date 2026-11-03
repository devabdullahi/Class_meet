/**
 * Request validation for creating a study group. Pure functions, no I/O, so
 * the rules are testable on their own and the client form can mirror them.
 */
import { HttpError } from '../errors.js';

export const MEETING_DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;
export type MeetingDay = (typeof MEETING_DAYS)[number];

export type GroupFormat = 'in_person' | 'online';

/** Includes the leader, so 2 is the smallest group that can exist. */
export const MIN_GROUP_MEMBERS = 2;
export const MAX_GROUP_MEMBERS = 50;
export const MAX_GOAL_LENGTH = 500;
export const MAX_LOCATION_LENGTH = 300;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface CreateGroupInput {
  courseId: string;
  goal: string;
  meetingDay: MeetingDay;
  /** "HH:MM", 24-hour. */
  meetingTime: string;
  format: GroupFormat;
  location: string;
  maxMembers: number;
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function invalid(field: string, message: string): HttpError {
  return HttpError.badRequest(`invalid_${field}`, message);
}

function readTrimmedString(body: Record<string, unknown>, field: string, label: string): string {
  const value = body[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalid(field, `${label} is required.`);
  }
  return value.trim();
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

export function parseCreateGroupInput(body: unknown): CreateGroupInput {
  if (typeof body !== 'object' || body === null) {
    throw HttpError.badRequest('invalid_body', 'Expected a JSON object.');
  }
  const fields = body as Record<string, unknown>;

  const courseId = fields['courseId'];
  if (!isUuid(courseId)) throw invalid('courseId', 'Choose a course.');

  const goal = readTrimmedString(fields, 'goal', 'Study goal');
  if (goal.length > MAX_GOAL_LENGTH) {
    throw invalid('goal', `Study goal must be ${MAX_GOAL_LENGTH} characters or fewer.`);
  }

  const meetingDay = fields['meetingDay'];
  if (!MEETING_DAYS.includes(meetingDay as MeetingDay)) {
    throw invalid('meetingDay', 'Choose a meeting day.');
  }

  const meetingTime = fields['meetingTime'];
  if (typeof meetingTime !== 'string' || !TIME_PATTERN.test(meetingTime)) {
    throw invalid('meetingTime', 'Meeting time must look like 14:30.');
  }

  const format = fields['format'];
  if (format !== 'in_person' && format !== 'online') {
    throw invalid('format', 'Format must be in_person or online.');
  }

  const location = readTrimmedString(fields, 'location', 'Meeting location');
  if (location.length > MAX_LOCATION_LENGTH) {
    throw invalid('location', `Meeting location must be ${MAX_LOCATION_LENGTH} characters or fewer.`);
  }
  if (format === 'online' && !isHttpUrl(location)) {
    throw invalid('location', 'An online group needs a meeting link starting with http:// or https://.');
  }

  const maxMembers = fields['maxMembers'];
  if (
    typeof maxMembers !== 'number' ||
    !Number.isInteger(maxMembers) ||
    maxMembers < MIN_GROUP_MEMBERS ||
    maxMembers > MAX_GROUP_MEMBERS
  ) {
    throw invalid(
      'maxMembers',
      `Group size must be a whole number from ${MIN_GROUP_MEMBERS} to ${MAX_GROUP_MEMBERS}.`,
    );
  }

  return {
    courseId,
    goal,
    meetingDay: meetingDay as MeetingDay,
    meetingTime,
    format,
    location,
    maxMembers,
  };
}

export type JoinDecision = 'approve' | 'decline';

export function parseEnrollInput(body: unknown): { courseId: string } {
  if (typeof body !== 'object' || body === null) {
    throw HttpError.badRequest('invalid_body', 'Expected a JSON object.');
  }
  const courseId = (body as Record<string, unknown>)['courseId'];
  if (!isUuid(courseId)) throw invalid('courseId', 'Choose a course.');
  return { courseId };
}

export function parseJoinDecision(body: unknown): JoinDecision {
  const decision =
    typeof body === 'object' && body !== null ? (body as Record<string, unknown>)['decision'] : undefined;
  if (decision !== 'approve' && decision !== 'decline') {
    throw invalid('decision', 'Decision must be approve or decline.');
  }
  return decision;
}
