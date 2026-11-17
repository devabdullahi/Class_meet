import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpError } from '../errors.js';
import { MAX_MAJOR_LENGTH, isEmptyProfile, parseProfileInput } from './validation.js';

function rejectionCode(body: unknown): string {
  try {
    parseProfileInput(body);
  } catch (error) {
    assert.ok(error instanceof HttpError, 'expected an HttpError');
    assert.equal(error.status, 400);
    return error.code;
  }
  assert.fail('expected the input to be rejected');
}

test('accepts a full profile and trims the major', () => {
  assert.deepEqual(
    parseProfileInput({
      major: '  Computer Science ',
      year: 'junior',
      meetingPreference: 'on_campus',
      studyStyles: ['practice_problems', 'talking_it_through'],
    }),
    {
      major: 'Computer Science',
      year: 'junior',
      meetingPreference: 'on_campus',
      studyStyles: ['practice_problems', 'talking_it_through'],
    },
  );
});

test('every field is optional, and blank means not chosen', () => {
  const profile = parseProfileInput({ major: '   ', year: '', meetingPreference: null });
  assert.deepEqual(profile, { major: null, year: null, meetingPreference: null, studyStyles: [] });
  assert.equal(isEmptyProfile(profile), true);
  assert.equal(isEmptyProfile(parseProfileInput({ year: 'graduate' })), false);
});

test('allows at most two study styles, counting a repeat once', () => {
  assert.deepEqual(
    parseProfileInput({ studyStyles: ['exam_cramming', 'exam_cramming'] }).studyStyles,
    ['exam_cramming'],
  );
  assert.equal(
    rejectionCode({ studyStyles: ['exam_cramming', 'practice_problems', 'teaching_each_other'] }),
    'invalid_studyStyles',
  );
});

test('rejects values that are not on the lists', () => {
  assert.equal(rejectionCode({ year: 'fifth year' }), 'invalid_year');
  assert.equal(rejectionCode({ meetingPreference: 'hybrid' }), 'invalid_meetingPreference');
  assert.equal(rejectionCode({ studyStyles: ['call me at 555-0100'] }), 'invalid_studyStyles');
  assert.equal(rejectionCode({ studyStyles: 'practice_problems' }), 'invalid_studyStyles');
});

test('rejects an over-long or non-text major', () => {
  assert.equal(rejectionCode({ major: 'a'.repeat(MAX_MAJOR_LENGTH + 1) }), 'invalid_major');
  assert.equal(rejectionCode({ major: 7 }), 'invalid_major');
  assert.equal(parseProfileInput({ major: 'a'.repeat(MAX_MAJOR_LENGTH) }).major?.length, MAX_MAJOR_LENGTH);
});

test('rejects a body that is not an object', () => {
  assert.equal(rejectionCode(null), 'invalid_body');
  assert.equal(rejectionCode('Computer Science'), 'invalid_body');
});
