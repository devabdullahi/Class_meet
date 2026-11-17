/**
 * A student profile's choices and how they read to a group leader. Kept free
 * of React so the wording is testable on its own. The lists mirror
 * server/src/profiles/validation.ts, which stays the authority.
 */
import type { MeetingPreference, StudentProfile, StudentYear, StudyStyle } from './api';

export const MAX_MAJOR_LENGTH = 80;
/** The form says "Pick up to two"; the server enforces the same. */
export const MAX_STUDY_STYLES = 2;

export const STUDENT_YEARS: ReadonlyArray<{ value: StudentYear; label: string }> = [
  { value: 'freshman', label: 'Freshman' },
  { value: 'sophomore', label: 'Sophomore' },
  { value: 'junior', label: 'Junior' },
  { value: 'senior', label: 'Senior' },
  { value: 'graduate', label: 'Graduate' },
];

/** `label` is the form's choice; `fact` is how it reads beside a request. */
export const MEETING_PREFERENCES: ReadonlyArray<{ value: MeetingPreference; label: string; fact: string }> = [
  { value: 'on_campus', label: 'On campus', fact: 'On campus' },
  { value: 'online', label: 'Online', fact: 'Online' },
  { value: 'either', label: 'Either', fact: 'Online or on campus' },
];

export const STUDY_STYLES: ReadonlyArray<{ value: StudyStyle; label: string }> = [
  { value: 'practice_problems', label: 'Practice problems' },
  { value: 'talking_it_through', label: 'Talking it through' },
  { value: 'quiet_focused_work', label: 'Quiet, focused work' },
  { value: 'teaching_each_other', label: 'Teaching each other' },
  { value: 'exam_cramming', label: 'Exam cramming' },
];

export const EMPTY_PROFILE: StudentProfile = { major: null, year: null, meetingPreference: null, studyStyles: [] };

/** A profile with nothing in it is the same as no profile; the server stores it as none. */
export function isEmptyProfile(profile: StudentProfile): boolean {
  return (
    (profile.major ?? '').trim() === '' &&
    profile.year === null &&
    profile.meetingPreference === null &&
    profile.studyStyles.length === 0
  );
}

/** "Computer Science", "Junior", "On campus": whichever the student filled in, in that order. */
export function profileFacts(profile: StudentProfile): string[] {
  const facts: string[] = [];
  const major = (profile.major ?? '').trim();
  if (major !== '') facts.push(major);
  const year = STUDENT_YEARS.find((option) => option.value === profile.year);
  if (year !== undefined) facts.push(year.label);
  const meeting = MEETING_PREFERENCES.find((option) => option.value === profile.meetingPreference);
  if (meeting !== undefined) facts.push(meeting.fact);
  return facts;
}

/** "Studies by practice problems and talking it through", or null when no style is chosen. */
export function studyStyleLine(profile: StudentProfile): string | null {
  const phrases = STUDY_STYLES.filter((style) => profile.studyStyles.includes(style.value)).map((style) =>
    style.label.toLowerCase(),
  );
  return phrases.length === 0 ? null : `Studies by ${phrases.join(' and ')}`;
}
