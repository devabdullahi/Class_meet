/**
 * A student's profile: what a group leader sees beside their join request.
 * Pure functions, no I/O, so the rules are testable on their own and the
 * client form can mirror them (client/src/profile.ts).
 *
 * Every field is optional. Nothing here is contact information, and the
 * allowed values for year, meeting place and study style are fixed lists,
 * so the only free text is the major.
 */
import { HttpError } from '../errors.js';

export const STUDENT_YEARS = ['freshman', 'sophomore', 'junior', 'senior', 'graduate'] as const;
export type StudentYear = (typeof STUDENT_YEARS)[number];

export const MEETING_PREFERENCES = ['on_campus', 'online', 'either'] as const;
export type MeetingPreference = (typeof MEETING_PREFERENCES)[number];

export const STUDY_STYLES = [
  'practice_problems',
  'talking_it_through',
  'quiet_focused_work',
  'teaching_each_other',
  'exam_cramming',
] as const;
export type StudyStyle = (typeof STUDY_STYLES)[number];

export const MAX_MAJOR_LENGTH = 80;
/** The form says "Pick up to two"; migration 005 enforces the same. */
export const MAX_STUDY_STYLES = 2;

export interface StudentProfile {
  major: string | null;
  year: StudentYear | null;
  meetingPreference: MeetingPreference | null;
  studyStyles: StudyStyle[];
}

/** A profile with nothing in it is the same as no profile. */
export function isEmptyProfile(profile: StudentProfile): boolean {
  return (
    profile.major === null &&
    profile.year === null &&
    profile.meetingPreference === null &&
    profile.studyStyles.length === 0
  );
}

function invalid(field: string, message: string): HttpError {
  return HttpError.badRequest(`invalid_${field}`, message);
}

/** null, undefined or '' mean "not chosen". */
function readChoice<Choice extends string>(
  fields: Record<string, unknown>,
  field: string,
  choices: readonly Choice[],
  message: string,
): Choice | null {
  const value = fields[field];
  if (value === null || value === undefined || value === '') return null;
  if (!choices.includes(value as Choice)) throw invalid(field, message);
  return value as Choice;
}

function readMajor(fields: Record<string, unknown>): string | null {
  const value = fields['major'];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw invalid('major', 'Major must be text.');
  const major = value.trim();
  if (major.length > MAX_MAJOR_LENGTH) {
    throw invalid('major', `Major must be ${MAX_MAJOR_LENGTH} characters or fewer.`);
  }
  return major === '' ? null : major;
}

function readStudyStyles(fields: Record<string, unknown>): StudyStyle[] {
  const value = fields['studyStyles'];
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value) || !value.every((style) => STUDY_STYLES.includes(style as StudyStyle))) {
    throw invalid('studyStyles', 'Choose study styles from the list.');
  }
  const styles = [...new Set(value as StudyStyle[])];
  if (styles.length > MAX_STUDY_STYLES) {
    throw invalid('studyStyles', `Pick up to ${MAX_STUDY_STYLES} study styles.`);
  }
  return styles;
}

/** The whole profile is sent on every save; a field left out is cleared. */
export function parseProfileInput(body: unknown): StudentProfile {
  if (typeof body !== 'object' || body === null) {
    throw HttpError.badRequest('invalid_body', 'Expected a JSON object.');
  }
  const fields = body as Record<string, unknown>;
  return {
    major: readMajor(fields),
    year: readChoice(fields, 'year', STUDENT_YEARS, 'Choose a year from the list.'),
    meetingPreference: readChoice(
      fields,
      'meetingPreference',
      MEETING_PREFERENCES,
      'Choose on campus, online or either.',
    ),
    studyStyles: readStudyStyles(fields),
  };
}
