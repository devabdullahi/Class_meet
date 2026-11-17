import { expect, test } from 'vitest';
import { toCreateGroupRequest, validateGroupForm, type GroupFormValues } from './groupForm';

const VALID: GroupFormValues = {
  courseId: 'c1',
  name: '  Midterm crew  ',
  goal: '  Review SOLID  ',
  meetingDay: 'Tuesday',
  meetingTime: '14:30',
  format: 'in_person',
  location: ' Library 412 ',
  groupSize: '6',
};

test('a complete form has no errors and becomes a trimmed request', () => {
  expect(validateGroupForm(VALID)).toEqual({});
  expect(toCreateGroupRequest(VALID)).toEqual({
    courseId: 'c1',
    name: 'Midterm crew',
    goal: 'Review SOLID',
    meetingDay: 'Tuesday',
    meetingTime: '14:30',
    format: 'in_person',
    location: 'Library 412',
    maxMembers: 6,
  });
});

test.each(['', '   '])('a name of %j is required', (name) => {
  expect(validateGroupForm({ ...VALID, name })).toEqual({ name: 'Give the group a name.' });
});

test.each(['2', '50'])('group size %s is allowed', (groupSize) => {
  expect(validateGroupForm({ ...VALID, groupSize })).toEqual({});
});

test.each(['1', '51', '3.5', 'four', ' '])('group size %j is not', (groupSize) => {
  expect(Object.keys(validateGroupForm({ ...VALID, groupSize }))).toEqual(['groupSize']);
});

test('an online group needs an http(s) link, like the server requires', () => {
  const online = { ...VALID, format: 'online' as const };
  expect(validateGroupForm({ ...online, location: 'https://zoom.us/j/1' })).toEqual({});
  expect(validateGroupForm({ ...online, location: 'zoom.us/j/1' }).location).toBe(
    'Paste the full link, starting with https://',
  );
  expect(validateGroupForm({ ...online, location: 'javascript:alert(1)' }).location).toBeDefined();
});
