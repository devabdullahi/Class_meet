import { expect, test } from 'vitest';
import { EMPTY_PROFILE, isEmptyProfile, profileFacts, studyStyleLine } from './profile';

test('the facts line lists what the student filled in, in a fixed order', () => {
  expect(
    profileFacts({ major: 'Computer Science', year: 'junior', meetingPreference: 'on_campus', studyStyles: [] }),
  ).toEqual(['Computer Science', 'Junior', 'On campus']);
  expect(profileFacts({ ...EMPTY_PROFILE, year: 'senior', meetingPreference: 'either' })).toEqual([
    'Senior',
    'Online or on campus',
  ]);
  expect(profileFacts({ ...EMPTY_PROFILE, major: '   ' })).toEqual([]);
});

test('study styles read as one sentence, in the form\'s order', () => {
  expect(studyStyleLine({ ...EMPTY_PROFILE, studyStyles: ['talking_it_through', 'practice_problems'] })).toBe(
    'Studies by practice problems and talking it through',
  );
  expect(studyStyleLine({ ...EMPTY_PROFILE, studyStyles: ['quiet_focused_work'] })).toBe(
    'Studies by quiet, focused work',
  );
  expect(studyStyleLine(EMPTY_PROFILE)).toBeNull();
});

test('a profile with only blanks counts as no profile', () => {
  expect(isEmptyProfile(EMPTY_PROFILE)).toBe(true);
  expect(isEmptyProfile({ ...EMPTY_PROFILE, major: '  ' })).toBe(true);
  expect(isEmptyProfile({ ...EMPTY_PROFILE, studyStyles: ['exam_cramming'] })).toBe(false);
});
