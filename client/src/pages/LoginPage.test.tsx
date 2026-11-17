import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { api, ApiError } from '../api';
import { LoginPage } from './LoginPage';

const SIGNED_IN = { status: 'signed-in', user: { id: 'u1' }, error: null, config: null };
const SIGNED_OUT = { status: 'signed-out', user: null, error: null, config: null };
const auth = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock('../auth/useAuth', () => ({ useAuth: () => auth.current }));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, api: { ...actual.api, fetchCourseLinkTitle: vi.fn() } };
});

const fetchCourseLinkTitle = vi.mocked(api.fetchCourseLinkTitle);

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderLogin(from: unknown, signedIn = true) {
  auth.current = signedIn ? SIGNED_IN : SIGNED_OUT;
  render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state: { from } }]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/groups/:courseId/:groupId" element={<h1>Group page</h1>} />
        <Route path="/join/:linkCode" element={<h1>Course link page</h1>} />
        <Route path="/" element={<h1>My courses</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

test('after signing in, the student returns to the page they were sent from', async () => {
  renderLogin('/groups/c1/g1');
  expect(await screen.findByRole('heading', { name: 'Group page' })).toBeTruthy();
});

test('after signing in from a course link, the student returns to the link', async () => {
  renderLogin('/join/CSE-3311');
  expect(await screen.findByRole('heading', { name: 'Course link page' })).toBeTruthy();
});

test.each([
  ['no remembered page', undefined],
  ['another site', '//evil.example/steal'],
  ['the login page itself', '/login'],
  ['something that is not a path', 42],
])('with %s, the student goes to My courses', async (_case, from) => {
  renderLogin(from);
  expect(await screen.findByRole('heading', { name: 'My courses' })).toBeTruthy();
});

const USUAL_HEADING = 'Find a study group for the course you’re actually in.';

test('signed out from a course link, the sign-in page invites the student to that course', async () => {
  fetchCourseLinkTitle.mockResolvedValue({
    course: { code: 'CSE 3311', title: 'Object Oriented Software Engineering' },
  });
  renderLogin('/join/cse-3311', false);
  expect(await screen.findByRole('heading', { level: 1, name: 'Join the CSE 3311 study groups' })).toBeTruthy();
  expect(
    screen.getByText(
      'Sign in to see the study groups for Object Oriented Software Engineering and add the course in one tap.',
    ),
  ).toBeTruthy();
  expect(fetchCourseLinkTitle).toHaveBeenCalledWith('cse-3311');
});

// The heading would otherwise repeat whatever text someone put in a /join/ link.
test('when the link names no course in the catalog, the sign-in page is the usual one', async () => {
  fetchCourseLinkTitle.mockRejectedValue(new ApiError(404, 'course_not_found', 'No course has that code.'));
  renderLogin('/join/Free-Gift-Cards-Here', false);
  await vi.waitFor(() => expect(fetchCourseLinkTitle).toHaveBeenCalledWith('Free-Gift-Cards-Here'));
  expect(screen.getByRole('heading', { level: 1, name: USUAL_HEADING })).toBeTruthy();
  expect(screen.queryByText(/Free Gift Cards/i)).toBeNull();
});

test('signed out from anywhere else, the sign-in page is the usual one', () => {
  renderLogin('/groups/c1/g1', false);
  expect(screen.getByRole('heading', { level: 1, name: USUAL_HEADING })).toBeTruthy();
  expect(fetchCourseLinkTitle).not.toHaveBeenCalled();
});
