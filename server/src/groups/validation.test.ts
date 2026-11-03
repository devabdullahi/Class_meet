import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpError } from '../errors.js';
import { courseSearchPatterns, parseCreateGroupInput } from './validation.js';

const COURSE_ID = '3f2b8c1e-5d4a-4c0e-9b7a-1a2b3c4d5e6f';

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    courseId: COURSE_ID,
    goal: '  Review design patterns  ',
    meetingDay: 'Tuesday',
    meetingTime: '14:30',
    format: 'in_person',
    location: 'Central Library, Room 412',
    maxMembers: 6,
    ...overrides,
  };
}

function rejectionCode(body: unknown): string {
  try {
    parseCreateGroupInput(body);
  } catch (error) {
    assert.ok(error instanceof HttpError, 'expected an HttpError');
    assert.equal(error.status, 400);
    return error.code;
  }
  assert.fail('expected the input to be rejected');
}

test('accepts a valid in-person group and trims text fields', () => {
  const input = parseCreateGroupInput(validBody());
  assert.equal(input.goal, 'Review design patterns');
  assert.equal(input.meetingDay, 'Tuesday');
  assert.equal(input.maxMembers, 6);
});

test('accepts an online group with an https link', () => {
  const input = parseCreateGroupInput(
    validBody({ format: 'online', location: 'https://teams.microsoft.com/l/meetup-join/abc' }),
  );
  assert.equal(input.format, 'online');
});

test('rejects a body that is not an object', () => {
  assert.equal(rejectionCode(null), 'invalid_body');
  assert.equal(rejectionCode('nope'), 'invalid_body');
});

test('rejects a missing or malformed course id', () => {
  assert.equal(rejectionCode(validBody({ courseId: undefined })), 'invalid_courseId');
  assert.equal(rejectionCode(validBody({ courseId: 'CSE 3311' })), 'invalid_courseId');
});

test('rejects an empty or whitespace-only goal', () => {
  assert.equal(rejectionCode(validBody({ goal: '   ' })), 'invalid_goal');
});

test('rejects a goal over the length limit', () => {
  assert.equal(rejectionCode(validBody({ goal: 'x'.repeat(501) })), 'invalid_goal');
});

test('rejects an unknown meeting day', () => {
  assert.equal(rejectionCode(validBody({ meetingDay: 'Funday' })), 'invalid_meetingDay');
});


for (const time of ['', '9:30', '24:00', '12:60', '2pm']) {
  test(`rejects meeting time ${JSON.stringify(time)}`, () => {
    assert.equal(rejectionCode(validBody({ meetingTime: time })), 'invalid_meetingTime');
  });
}

for (const size of [0, 1, -1, 2.5, 51, '6', null]) {
  test(`rejects group size ${JSON.stringify(size)}`, () => {
    assert.equal(rejectionCode(validBody({ maxMembers: size })), 'invalid_maxMembers');
  });
}

for (const size of [2, 50]) {
  test(`accepts the boundary group size ${size}`, () => {
    assert.equal(parseCreateGroupInput(validBody({ maxMembers: size })).maxMembers, size);
  });
}

test('rejects an unknown format', () => {
  assert.equal(rejectionCode(validBody({ format: 'hybrid' })), 'invalid_format');
});

for (const link of ['not-a-link', 'ftp://example.com/room', 'javascript:alert(1)']) {
  test(`rejects online link ${JSON.stringify(link)}`, () => {
    assert.equal(rejectionCode(validBody({ format: 'online', location: link })), 'invalid_location');
  });
}

test('course search also matches a code typed without its space', () => {
  assert.deepEqual(courseSearchPatterns('cse3311'), { text: '%cse3311%', compact: '%cse3311%' });
  assert.deepEqual(courseSearchPatterns(' CSE  3311 '), { text: '%CSE  3311%', compact: '%CSE3311%' });
});

test('course search escapes LIKE wildcards in what the student typed', () => {
  assert.deepEqual(courseSearchPatterns('100%_x'), { text: '%100\\%\\_x%', compact: '%100\\%\\_x%' });
});
