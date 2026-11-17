/**
 * The Create Group form's rules, kept free of React so they can be tested on
 * their own. They mirror server/src/groups/validation.ts, which stays the
 * authority: these exist to explain a problem next to the field before the
 * request is sent, not to replace the server's checks.
 */
import type { CreateGroupRequest, GroupFormat, MeetingDay } from './api';

export const MEETING_DAYS: MeetingDay[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/** Includes the leader, so 2 is the smallest group that can exist. */
export const MIN_GROUP_SIZE = 2;
export const MAX_GROUP_SIZE = 50;
export const DEFAULT_GROUP_SIZE = 4;
export const MAX_GOAL_LENGTH = 500;
export const MAX_LOCATION_LENGTH = 300;

export interface GroupFormValues {
  courseId: string;
  goal: string;
  meetingDay: MeetingDay | '';
  /** "HH:MM" from the time input, or '' when not chosen. */
  meetingTime: string;
  format: GroupFormat;
  location: string;
  /** Kept as typed, so a half-typed number is not silently changed. */
  groupSize: string;
}

export type GroupFormField = keyof GroupFormValues;
export type GroupFormErrors = Partial<Record<GroupFormField, string>>;

/** The order fields appear on screen, so focus can go to the first problem. */
export const GROUP_FORM_FIELD_ORDER: GroupFormField[] = [
  'courseId',
  'goal',
  'meetingDay',
  'meetingTime',
  'format',
  'location',
  'groupSize',
];

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

function groupSizeError(groupSize: string): string | undefined {
  const size = Number(groupSize);
  const valid =
    groupSize.trim() !== '' && Number.isInteger(size) && size >= MIN_GROUP_SIZE && size <= MAX_GROUP_SIZE;
  return valid ? undefined : `Enter a whole number from ${MIN_GROUP_SIZE} to ${MAX_GROUP_SIZE}.`;
}

function locationError(format: GroupFormat, location: string): string | undefined {
  const trimmed = location.trim();
  if (format === 'online') {
    if (trimmed === '') return 'Paste the meeting link.';
    if (!isHttpUrl(trimmed)) return 'Paste the full link, starting with https://';
    return undefined;
  }
  return trimmed === '' ? 'Say where the group will meet.' : undefined;
}

export function validateGroupForm(values: GroupFormValues): GroupFormErrors {
  const errors: GroupFormErrors = {};
  if (values.courseId === '') errors.courseId = 'Choose a course.';
  if (values.goal.trim() === '') errors.goal = 'Say what the group will study.';
  if (values.meetingDay === '') errors.meetingDay = 'Choose a day.';
  if (values.meetingTime === '') errors.meetingTime = 'Choose a time.';
  const location = locationError(values.format, values.location);
  if (location !== undefined) errors.location = location;
  const groupSize = groupSizeError(values.groupSize);
  if (groupSize !== undefined) errors.groupSize = groupSize;
  return errors;
}

/** Only call with values that passed `validateGroupForm`. */
export function toCreateGroupRequest(values: GroupFormValues): CreateGroupRequest {
  return {
    courseId: values.courseId,
    goal: values.goal.trim(),
    meetingDay: values.meetingDay as MeetingDay,
    meetingTime: values.meetingTime,
    format: values.format,
    location: values.location.trim(),
    maxMembers: Number(values.groupSize),
  };
}
