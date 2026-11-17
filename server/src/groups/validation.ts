/**
 * Request validation for creating and editing a study group. Pure functions,
 * no I/O, so the rules are testable on their own and the client form can
 * mirror them.
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
export const MAX_NAME_LENGTH = 80;
export const MAX_GOAL_LENGTH = 500;
export const MAX_LOCATION_LENGTH = 300;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Everything about a group its leader chooses, and may later change. */
export interface GroupSettings {
  name: string;
  goal: string;
  meetingDay: MeetingDay;
  /** "HH:MM", 24-hour. */
  meetingTime: string;
  format: GroupFormat;
  location: string;
  maxMembers: number;
}

/** A group's course is fixed when it is created, so only creating names one. */
export interface CreateGroupInput extends GroupSettings {
  courseId: string;
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

// https only: every meeting platform serves its links over https, and a plain
// http link would send the meeting's id (often its only key) unencrypted.
function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function readBody(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null) {
    throw HttpError.badRequest('invalid_body', 'Expected a JSON object.');
  }
  return body as Record<string, unknown>;
}

export function parseCreateGroupInput(body: unknown): CreateGroupInput {
  const fields = readBody(body);
  const courseId = fields['courseId'];
  if (!isUuid(courseId)) throw invalid('courseId', 'Choose a course.');
  return { courseId, ...parseGroupSettings(fields) };
}

/**
 * An edit sends every setting, as the form holds them all; there is no
 * partial update. Whether the new size still fits the members already in the
 * group depends on the database, so the repository checks that.
 */
export function parseUpdateGroupInput(body: unknown): GroupSettings {
  return parseGroupSettings(readBody(body));
}

function parseGroupSettings(fields: Record<string, unknown>): GroupSettings {
  const name = readTrimmedString(fields, 'name', 'Group name');
  if (name.length > MAX_NAME_LENGTH) {
    throw invalid('name', `Group name must be ${MAX_NAME_LENGTH} characters or fewer.`);
  }

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
  if (format === 'online' && !isHttpsUrl(location)) {
    throw invalid('location', 'An online group needs a meeting link starting with https://.');
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
    name,
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

/**
 * What a course search matches against. Students type "cse3311" as often as
 * "CSE 3311", so the code is also compared with its spaces removed.
 * LIKE wildcards in the typed text are escaped so they match literally.
 */
export function courseSearchPatterns(search: string): { text: string; compact: string } {
  const escape = (value: string): string => value.replace(/[\\%_]/g, (character) => `\\${character}`);
  return {
    text: `%${escape(search.trim())}%`,
    compact: `%${escape(search.replace(/\s+/g, ''))}%`,
  };
}

/** Longer than any course code in the catalog; anything past it is not a code. */
export const MAX_COURSE_LINK_CODE_LENGTH = 40;

/**
 * The course code from a course link, /join/CSE-3311, in the form the
 * repository compares it in. A link spells the code's space as a hyphen, so
 * the path stays readable without %20; one typed by hand with a space (which
 * reaches us decoded) means the same course, and so does any letter case.
 * The catalog side is converted the same way (see findCourseByLinkCode).
 */
export function parseCourseLinkCode(raw: unknown): string {
  const code = typeof raw === 'string' ? raw.trim().replace(/\s+/g, '-').toUpperCase() : '';
  if (code === '' || code.length > MAX_COURSE_LINK_CODE_LENGTH) {
    throw HttpError.badRequest('invalid_course_code', 'That is not a course code.');
  }
  return code;
}
