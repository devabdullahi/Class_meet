import { expect, test } from 'vitest';
import type { GroupDetails } from './api';
import {
  groupFormValuesFrom,
  minimumGroupSize,
  toCreateGroupRequest,
  toGroupSettings,
  validateGroupForm,
  type GroupFormValues,
} from './groupForm';

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

test('an edited group cannot be made smaller than the members already in it', () => {
  expect(validateGroupForm({ ...VALID, groupSize: '3' }, 3)).toEqual({});
  expect(validateGroupForm({ ...VALID, groupSize: '2' }, 3)).toEqual({
    groupSize: 'The group has 3 members, so its size must be at least 3.',
  });
  expect(minimumGroupSize(3)).toBe(3);
  expect(minimumGroupSize(1)).toBe(2);
});

test('the edit form starts from the group as it is, and saves without a course', () => {
  const group = {
    id: 'g1',
    courseId: 'c1',
    name: null,
    goal: 'Review SOLID',
    meetingDay: 'Tuesday',
    meetingTime: '14:30',
    format: 'online',
    location: 'https://zoom.us/j/1',
    maxMembers: 6,
  } as GroupDetails;
  const values = groupFormValuesFrom(group);
  expect(values).toEqual({
    courseId: 'c1',
    name: '',
    goal: 'Review SOLID',
    meetingDay: 'Tuesday',
    meetingTime: '14:30',
    format: 'online',
    location: 'https://zoom.us/j/1',
    groupSize: '6',
  });
  expect(validateGroupForm(values).name).toBe('Give the group a name.');
  expect(toGroupSettings({ ...values, name: 'Crew' })).not.toHaveProperty('courseId');
});

test('an online group needs an http(s) link, like the server requires', () => {
  const online = { ...VALID, format: 'online' as const };
  expect(validateGroupForm({ ...online, location: 'https://zoom.us/j/1' })).toEqual({});
  expect(validateGroupForm({ ...online, location: 'zoom.us/j/1' }).location).toBe(
    'Paste the full link, starting with https://',
  );
  expect(validateGroupForm({ ...online, location: 'javascript:alert(1)' }).location).toBeDefined();
});
