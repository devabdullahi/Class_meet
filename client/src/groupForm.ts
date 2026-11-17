/**
 * The group form's rules (creating and editing a group), kept free of React
 * so they can be tested on their own. They mirror server/src/groups/validation.ts, which stays the
 * authority: these exist to explain a problem next to the field before the
 * request is sent, not to replace the server's checks.
 */
import type { CreateGroupRequest, GroupDetails, GroupFormat, GroupSettings, MeetingDay } from './api';

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
export const MAX_NAME_LENGTH = 80;
export const MAX_GOAL_LENGTH = 500;
export const MAX_LOCATION_LENGTH = 300;

export interface GroupFormValues {
  courseId: string;
  name: string;
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
  'name',
  'goal',
  'meetingDay',
  'meetingTime',
  'format',
  'location',
  'groupSize',
];

// https only: every meeting platform serves its links over https, and a plain
// http link would send the meeting's id (often its only key) unencrypted.
function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/** The smallest size a group may have: 2, or the members already in it when that is more. */
export function minimumGroupSize(memberCount: number): number {
  return Math.max(MIN_GROUP_SIZE, memberCount);
}

function groupSizeError(groupSize: string, memberCount: number): string | undefined {
  const size = Number(groupSize);
  const valid =
    groupSize.trim() !== '' && Number.isInteger(size) && size >= MIN_GROUP_SIZE && size <= MAX_GROUP_SIZE;
  if (!valid) return `Enter a whole number from ${MIN_GROUP_SIZE} to ${MAX_GROUP_SIZE}.`;
  if (size < memberCount) return `The group has ${memberCount} members, so its size must be at least ${memberCount}.`;
  return undefined;
}

function locationError(format: GroupFormat, location: string): string | undefined {
  const trimmed = location.trim();
  if (format === 'online') {
    if (trimmed === '') return 'Paste the meeting link.';
    if (!isHttpsUrl(trimmed)) return 'Paste the full link, starting with https://';
    return undefined;
  }
  return trimmed === '' ? 'Say where the group will meet.' : undefined;
}

/** `memberCount` is the members already in the group being edited; 0 for a new group. */
export function validateGroupForm(values: GroupFormValues, memberCount = 0): GroupFormErrors {
  const errors: GroupFormErrors = {};
  if (values.courseId === '') errors.courseId = 'Choose a course.';
  if (values.name.trim() === '') errors.name = 'Give the group a name.';
  if (values.goal.trim() === '') errors.goal = 'Say what the group will study.';
  if (values.meetingDay === '') errors.meetingDay = 'Choose a day.';
  if (values.meetingTime === '') errors.meetingTime = 'Choose a time.';
  const location = locationError(values.format, values.location);
  if (location !== undefined) errors.location = location;
  const groupSize = groupSizeError(values.groupSize, memberCount);
  if (groupSize !== undefined) errors.groupSize = groupSize;
  return errors;
}

/** The form, filled in with a group's current settings for its leader to edit. */
export function groupFormValuesFrom(group: GroupDetails): GroupFormValues {
  return {
    courseId: group.courseId,
    // A group from before names existed has none yet; its leader adds one.
    name: group.name ?? '',
    goal: group.goal,
    meetingDay: group.meetingDay,
    meetingTime: group.meetingTime,
    format: group.format,
    // The leader always sees the location; '' only satisfies the type.
    location: group.location ?? '',
    groupSize: String(group.maxMembers),
  };
}

/** Only call with values that passed `validateGroupForm`. */
export function toCreateGroupRequest(values: GroupFormValues): CreateGroupRequest {
  return { courseId: values.courseId, ...toGroupSettings(values) };
}

/** Only call with values that passed `validateGroupForm`. */
export function toGroupSettings(values: GroupFormValues): GroupSettings {
  return {
    name: values.name.trim(),
    goal: values.goal.trim(),
    meetingDay: values.meetingDay as MeetingDay,
    meetingTime: values.meetingTime,
    format: values.format,
    location: values.location.trim(),
    maxMembers: Number(values.groupSize),
  };
}
