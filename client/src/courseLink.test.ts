import { expect, test } from 'vitest';
import { courseCodeFromLinkCode, courseLinkPath, courseLinkUrl, linkCodeFromPath } from './courseLink';

test('a course link spells the course code with its space as a hyphen', () => {
  expect(courseLinkPath('CSE 3311')).toBe('/join/CSE-3311');
  expect(courseLinkUrl('CSE 3311', 'https://classmeet.example')).toBe('https://classmeet.example/join/CSE-3311');
});

test('a course link is on the origin the app is served from', () => {
  expect(courseLinkUrl('MATH 3330')).toBe(`${window.location.origin}/join/MATH-3330`);
});

test('a code from a link reads as the course code students write', () => {
  expect(courseCodeFromLinkCode('cse-3399')).toBe('CSE 3399');
  expect(courseCodeFromLinkCode('CSE 3399')).toBe('CSE 3399');
});

test('the code is read from a course link path, and nothing from any other path', () => {
  expect(linkCodeFromPath('/join/CSE-3311')).toBe('CSE-3311');
  expect(linkCodeFromPath('/join/CSE%203311?from=discord')).toBe('CSE 3311');
  expect(linkCodeFromPath('/join/')).toBeNull();
  expect(linkCodeFromPath('/join/%E0%A4%A')).toBeNull();
  expect(linkCodeFromPath('/groups/c1')).toBeNull();
  expect(linkCodeFromPath('/')).toBeNull();
});
