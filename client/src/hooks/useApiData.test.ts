import { expect, test } from 'vitest';
import { ApiError } from '../api';
import { describeError } from './useApiData';

test('passes on what the API says about the student\'s own request', () => {
  expect(describeError(new ApiError(409, 'group_full', 'This group is full.'))).toBe('This group is full.');
});

test.each([
  ['a server failure', new ApiError(503, 'database_unavailable', 'Check DATABASE_URL in server/.env.')],
  ['an unexpected server error', new ApiError(500, 'internal_error', 'Stack trace here')],
  ['no network', new ApiError(0, 'network_error', 'Check that the server is running.')],
  ['a non-API error', new TypeError('x is undefined')],
])('replaces the details of %s with the fallback', (_case, error) => {
  expect(describeError(error, 'We could not load your courses.')).toBe('We could not load your courses.');
  expect(describeError(error)).toBe('Something went wrong on our side. Please try again.');
});
