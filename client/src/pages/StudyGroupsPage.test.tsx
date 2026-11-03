import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { api, ApiError, type GroupSummary } from '../api';
import { StudyGroupsPage } from './StudyGroupsPage';

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Dev Student', email: 'dev@mavs.uta.edu' }, signOut: vi.fn() }),
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, api: { ...actual.api, fetchCourseGroups: vi.fn() } };
});

const fetchCourseGroups = vi.mocked(api.fetchCourseGroups);

const COURSE = { id: 'c1', code: 'CSE 3311', title: 'Object Oriented Software Engineering' };

function group(overrides: Partial<GroupSummary>): GroupSummary {
  return {
    id: 'g1',
    courseId: 'c1',
    goal: 'Review SOLID',
    meetingDay: 'Tuesday',
    meetingTime: '14:30',
    format: 'in_person',
    location: 'Library 412',
    maxMembers: 6,
    memberCount: 2,
    ...overrides,
  };
}

const GROUPS = [
  group({ id: 'g1', goal: 'Review SOLID' }),
  group({ id: 'g2', goal: 'UML practice', meetingDay: 'Friday', format: 'online', location: 'https://meet.example/x' }),
  group({ id: 'g3', goal: 'Exam cram', memberCount: 6, maxMembers: 6, meetingDay: 'Saturday' }),
];

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/groups/c1']}>
      <Routes>
        <Route path="/groups/:courseId" element={<StudyGroupsPage />} />
        <Route path="/groups/:courseId/:groupId" element={<h1>Details page</h1>} />
        <Route path="/" element={<h1>My Courses page</h1>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

test('shows the course and its groups with time, place and seats', async () => {
  fetchCourseGroups.mockResolvedValue({ course: COURSE, groups: GROUPS });
  renderPage();
  expect(await screen.findByRole('heading', { level: 1, name: 'CSE 3311 — Study Groups' })).toBeTruthy();
  expect(fetchCourseGroups).toHaveBeenCalledWith('c1');
  expect(screen.getByText('Tue')).toBeTruthy();
  expect(screen.getAllByText('2:30')).toHaveLength(3);
  expect(screen.getAllByText('Library 412')).toHaveLength(2);
  expect(screen.getAllByText('2 of 6 seats filled')).toHaveLength(2);
  expect(screen.getByText('6 of 6 seats filled')).toBeTruthy();
});

test('online groups show Online instead of the raw meeting link', async () => {
  fetchCourseGroups.mockResolvedValue({ course: COURSE, groups: GROUPS });
  renderPage();
  expect(await screen.findByText('Online meeting')).toBeTruthy();
  expect(screen.queryByText(/meet\.example/)).toBeNull();
});

test('filters by format', async () => {
  fetchCourseGroups.mockResolvedValue({ course: COURSE, groups: GROUPS });
  const user = renderPage();
  await screen.findByText('Review SOLID');
  await user.selectOptions(screen.getByLabelText('Format'), 'Online');
  expect(screen.getByText('UML practice')).toBeTruthy();
  expect(screen.queryByText('Review SOLID')).toBeNull();
});

test('filters by day and by availability', async () => {
  fetchCourseGroups.mockResolvedValue({ course: COURSE, groups: GROUPS });
  const user = renderPage();
  await screen.findByText('Review SOLID');
  await user.selectOptions(screen.getByLabelText('Availability'), 'Full');
  expect(screen.getByText('Exam cram')).toBeTruthy();
  expect(screen.queryByText('Review SOLID')).toBeNull();
  await user.selectOptions(screen.getByLabelText('Availability'), 'All');
  await user.selectOptions(screen.getByLabelText('Day'), 'Friday');
  expect(screen.getByText('UML practice')).toBeTruthy();
  expect(screen.queryByText('Exam cram')).toBeNull();
});

test('says when the filters match nothing', async () => {
  fetchCourseGroups.mockResolvedValue({ course: COURSE, groups: GROUPS });
  const user = renderPage();
  await screen.findByText('Review SOLID');
  await user.selectOptions(screen.getByLabelText('Day'), 'Monday');
  expect(screen.getByRole('heading', { name: 'No groups match these filters' })).toBeTruthy();
});

test('invites the student to create the first group', async () => {
  fetchCourseGroups.mockResolvedValue({ course: COURSE, groups: [] });
  renderPage();
  expect(await screen.findByText(/No study groups yet for this course/)).toBeTruthy();
  const create = screen.getAllByRole('link', { name: 'Create Group' }).find((link) => link.getAttribute('href')?.includes('course=c1'));
  expect(create).toBeTruthy();
});

test('opens a group from its card', async () => {
  fetchCourseGroups.mockResolvedValue({ course: COURSE, groups: GROUPS });
  const user = renderPage();
  const links = await screen.findAllByRole('link', { name: /View group/i });
  await user.click(links[0]!);
  expect(screen.getByRole('heading', { name: 'Details page' })).toBeTruthy();
});

test('shows the server message when the course cannot be found', async () => {
  fetchCourseGroups.mockRejectedValue(new ApiError(404, 'course_not_found', 'That course does not exist.'));
  renderPage();
  expect((await screen.findByRole('alert')).textContent).toContain('That course does not exist.');
});

test('Back returns to My Courses', async () => {
  fetchCourseGroups.mockResolvedValue({ course: COURSE, groups: [] });
  const user = renderPage();
  await user.click(await screen.findByRole('link', { name: /Back to My Courses/ }));
  expect(screen.getByRole('heading', { name: 'My Courses page' })).toBeTruthy();
});
