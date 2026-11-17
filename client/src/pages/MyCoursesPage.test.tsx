import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
    api: {
      ...actual.api,
      fetchMyCourses: vi.fn(),
      searchCourses: vi.fn(),
      enrollInCourse: vi.fn(),
      removeCourse: vi.fn(),
    },
  };
});

const fetchMyCourses = vi.mocked(api.fetchMyCourses);
const searchCourses = vi.mocked(api.searchCourses);
const enrollInCourse = vi.mocked(api.enrollInCourse);
const removeCourse = vi.mocked(api.removeCourse);

const OOSE = {
  id: 'c1',
  code: 'CSE 3311',
  title: 'Object Oriented Software Engineering',
  groupCount: 6,
  openGroupCount: 4,
  joinedGroupCount: 1,
};
const AI = {
  id: 'c2',
  code: 'CSE 4308',
  title: 'Artificial Intelligence',
  groupCount: 1,
  openGroupCount: 0,
  joinedGroupCount: 0,
};
const OS = { id: 'c3', code: 'CSE 3320', title: 'Operating Systems', groupCount: 0, openGroupCount: 0, joinedGroupCount: 0 };

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

test('shows each course with how many groups are open and how many the student is in', async () => {
  fetchMyCourses.mockResolvedValue({ courses: [OOSE, AI, OS] });
  renderPage();
  expect(await screen.findByText('Object Oriented Software Engineering')).toBeTruthy();
  expect(screen.getByText((_, element) => element?.tagName === 'P' && element.textContent === '6 groups · 4 open')).toBeTruthy();
  expect(screen.getByText('You’re in 1')).toBeTruthy();
  expect(screen.getByText('1 group')).toBeTruthy();
  expect(screen.getByText('No groups yet — start one')).toBeTruthy();
  expect(screen.getAllByText(/You’re in/)).toHaveLength(1);
  expect(screen.getByRole('heading', { level: 1, name: 'My courses' })).toBeTruthy();
  expect(screen.getByText('dev.student@mavs.uta.edu')).toBeTruthy();
});

test('each course card is one link to its study groups', async () => {
  fetchMyCourses.mockResolvedValue({ courses: [OOSE] });
  const user = renderPage();
  await user.click(await screen.findByRole('link', { name: 'Object Oriented Software Engineering' }));
  expect(screen.getByRole('heading', { name: 'Groups page' })).toBeTruthy();
});

test('with no courses, the one primary action is adding the first course', async () => {
  fetchMyCourses.mockResolvedValue({ courses: [] });
  renderPage();
  expect(await screen.findByRole('heading', { name: 'No courses yet' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Add your first course' })).toBeTruthy();
  // Create Group would be a dead end without a course; only the sidebar link remains.
  expect(screen.getAllByRole('link', { name: 'Create group' })).toHaveLength(1);
});

test('says plainly when the courses cannot be loaded, without server details', async () => {
  fetchMyCourses.mockRejectedValue(
    new ApiError(503, 'database_unavailable', 'Could not reach the database. Check DATABASE_URL in server/.env.'),
  );
  renderPage();
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('We could not load your courses. Please try again.');
  expect(alert.textContent).not.toContain('DATABASE_URL');
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
});

test('Add Course opens the dialog and Escape returns focus to the button', async () => {
  fetchMyCourses.mockResolvedValue({ courses: [OOSE] });
  const user = renderPage();
  await screen.findByText('Object Oriented Software Engineering');
  const addCourse = screen.getByRole('button', { name: 'Add course' });
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
  await screen.findByRole('heading', { name: 'No courses yet' });
  await user.click(screen.getByRole('button', { name: 'Add course' }));
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
  await user.click(screen.getAllByRole('link', { name: 'Create group' })[1]!);
  expect(screen.getByRole('heading', { name: 'Create Group page' })).toBeTruthy();
});

test('Remove asks first, and Cancel keeps the course', async () => {
  fetchMyCourses.mockResolvedValue({ courses: [OOSE, AI] });
  const user = renderPage();
  await user.click(await screen.findByRole('button', { name: 'Remove CSE 3311' }));
  const question = screen.getByRole('group', { name: 'Remove CSE 3311 from your courses?' });
  expect(question.textContent).toContain('Any requests you sent to its groups are withdrawn.');
  expect(document.activeElement).toBe(within(question).getByRole('button', { name: 'Cancel' }));
  await user.click(within(question).getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('group')).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Remove CSE 3311' }));
  expect(removeCourse).not.toHaveBeenCalled();
});

test('a confirmed removal takes the course off the list and says so', async () => {
  fetchMyCourses.mockResolvedValueOnce({ courses: [OOSE, AI] }).mockResolvedValue({ courses: [AI] });
  removeCourse.mockResolvedValue(null);
  const user = renderPage();
  await user.click(await screen.findByRole('button', { name: 'Remove CSE 3311' }));
  const question = screen.getByRole('group', { name: 'Remove CSE 3311 from your courses?' });
  await user.click(within(question).getByRole('button', { name: 'Remove' }));
  expect(removeCourse).toHaveBeenCalledWith('c1');
  const notice = await screen.findByRole('status');
  expect(notice.textContent).toBe('CSE 3311 was removed from your courses.');
  expect(document.activeElement).toBe(notice);
  await waitFor(() => expect(screen.queryByText('Object Oriented Software Engineering')).toBeNull());
  expect(screen.getByText('Artificial Intelligence')).toBeTruthy();
});

test('a course whose group the student leads is kept, with the reason in the question', async () => {
  fetchMyCourses.mockResolvedValue({ courses: [OOSE] });
  removeCourse.mockRejectedValue(
    new ApiError(409, 'leads_group_in_course', 'You lead a study group in CSE 3311, so you cannot remove the course.'),
  );
  const user = renderPage();
  await user.click(await screen.findByRole('button', { name: 'Remove CSE 3311' }));
  const question = screen.getByRole('group', { name: 'Remove CSE 3311 from your courses?' });
  await user.click(within(question).getByRole('button', { name: 'Remove' }));
  expect((await within(question).findByRole('alert')).textContent).toBe(
    'You lead a study group in CSE 3311, so you cannot remove the course.',
  );
  expect(screen.getByText('Object Oriented Software Engineering')).toBeTruthy();
  expect(fetchMyCourses).toHaveBeenCalledTimes(1);
});

test('Sign out calls the auth provider', async () => {
  fetchMyCourses.mockResolvedValue({ courses: [] });
  const user = renderPage();
  await user.click(await screen.findByRole('button', { name: 'Sign out' }));
  expect(signOut).toHaveBeenCalledTimes(1);
});
