import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { api, ApiError } from '../api';
import { MyCoursesPage } from './MyCoursesPage';

const signOut = vi.fn(() => Promise.resolve());

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Dev Student', email: 'dev.student@mavs.uta.edu' },
    signOut,
  }),
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: { ...actual.api, fetchMyCourses: vi.fn(), searchCourses: vi.fn(), enrollInCourse: vi.fn() },
  };
});

const fetchMyCourses = vi.mocked(api.fetchMyCourses);
const searchCourses = vi.mocked(api.searchCourses);
const enrollInCourse = vi.mocked(api.enrollInCourse);

const OOSE = { id: 'c1', code: 'CSE 3311', title: 'Object Oriented Software Engineering', groupCount: 2 };
const AI = { id: 'c2', code: 'CSE 4308', title: 'Artificial Intelligence', groupCount: 1 };

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<MyCoursesPage />} />
        <Route path="/groups/create" element={<h1>Create Group page</h1>} />
        <Route path="/groups/:courseId" element={<h1>Groups page</h1>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

test('shows the student\'s courses with group counts', async () => {
  fetchMyCourses.mockResolvedValue({ courses: [OOSE, AI] });
  renderPage();
  expect(await screen.findByText('Object Oriented Software Engineering')).toBeTruthy();
  expect(screen.getByText('2 study groups')).toBeTruthy();
  expect(screen.getByText('1 study group')).toBeTruthy();
  expect(screen.getByRole('heading', { level: 1, name: 'My Courses' })).toBeTruthy();
  expect(screen.getByText('dev.student@mavs.uta.edu')).toBeTruthy();
});

test('each course links to its study groups by course id', async () => {
  fetchMyCourses.mockResolvedValue({ courses: [OOSE] });
  const user = renderPage();
  await user.click(await screen.findByRole('link', { name: /View Groups/ }));
  expect(screen.getByRole('heading', { name: 'Groups page' })).toBeTruthy();
});

test('invites the student to add a course when they have none', async () => {
  fetchMyCourses.mockResolvedValue({ courses: [] });
  renderPage();
  expect(await screen.findByText(/You have not added any courses yet/)).toBeTruthy();
});

test('shows the server message when the courses cannot be loaded', async () => {
  fetchMyCourses.mockRejectedValue(new ApiError(503, 'database_unavailable', 'Could not reach the database.'));
  renderPage();
  expect((await screen.findByRole('alert')).textContent).toBe('Could not reach the database.');
});

test('Add Course opens the dialog and Escape returns focus to the button', async () => {
  fetchMyCourses.mockResolvedValue({ courses: [OOSE] });
  const user = renderPage();
  await screen.findByText('Object Oriented Software Engineering');
  const addCourse = screen.getByRole('button', { name: 'Add Course' });
  await user.click(addCourse);
  expect(screen.getByRole('dialog')).toBeTruthy();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(addCourse);
});

test('a course added in the dialog appears in the list', async () => {
  fetchMyCourses.mockResolvedValueOnce({ courses: [] }).mockResolvedValue({ courses: [AI] });
  searchCourses.mockResolvedValue({ courses: [{ id: 'c2', code: 'CSE 4308', title: 'Artificial Intelligence', enrolled: false }] });
  enrollInCourse.mockResolvedValue({ course: { id: 'c2', code: 'CSE 4308', title: 'Artificial Intelligence' } });
  const user = renderPage();
  await screen.findByText(/You have not added any courses yet/);
  await user.click(screen.getByRole('button', { name: 'Add Course' }));
  await user.type(screen.getByLabelText('Course name or code'), 'AI{Enter}');
  await user.click(await screen.findByRole('button', { name: 'Add CSE 4308' }));
  await waitFor(() => expect(fetchMyCourses).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole('heading', { name: 'Artificial Intelligence', level: 2 })).toBeTruthy();
});

test('Create Group navigates to the create group page', async () => {
  fetchMyCourses.mockResolvedValue({ courses: [OOSE] });
  const user = renderPage();
  await screen.findByText('Object Oriented Software Engineering');
  // One link is in the sidebar and one beside the heading; both go to the same page.
  await user.click(screen.getAllByRole('link', { name: 'Create Group' })[1]!);
  expect(screen.getByRole('heading', { name: 'Create Group page' })).toBeTruthy();
});

test('Sign out calls the auth provider', async () => {
  fetchMyCourses.mockResolvedValue({ courses: [] });
  const user = renderPage();
  await user.click(await screen.findByRole('button', { name: 'Sign out' }));
  expect(signOut).toHaveBeenCalledTimes(1);
});
