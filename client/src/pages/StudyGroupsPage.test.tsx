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
    viewerRole: 'none',
    viewerRequestStatus: null,
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
  expect(await screen.findByRole('heading', { level: 1, name: 'CSE 3311 study groups' })).toBeTruthy();
  expect(fetchCourseGroups).toHaveBeenCalledWith('c1');
  expect(screen.getByText('Tue')).toBeTruthy();
  expect(screen.getAllByText('2:30')).toHaveLength(3);
  expect(screen.getAllByText('Library 412')).toHaveLength(2);
  expect(screen.getAllByText('4 seats left')).toHaveLength(2);
  expect(screen.getByText('Full', { selector: 'strong' })).toBeTruthy();
});

test('online groups show the platform, never the raw link, and only Online when the link is withheld', async () => {
  fetchCourseGroups.mockResolvedValue({
    course: COURSE,
    groups: [
      group({ id: 'g4', goal: 'Members only', format: 'online', location: null }),
      group({ id: 'g5', goal: 'Mine', format: 'online', location: 'https://zoom.us/j/1', viewerRole: 'member' }),
    ],
  });
  renderPage();
  expect(await screen.findByText('Online', { selector: '.cm-group-card__place span' })).toBeTruthy();
  expect(screen.getByText('Online · Zoom')).toBeTruthy();
  expect(screen.queryByText(/zoom\.us/)).toBeNull();
});

test('lists groups by their next meeting, soonest first', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // Wednesday 4 November 2026, 17:00.
  vi.setSystemTime(new Date(2026, 10, 4, 17, 0));
  fetchCourseGroups.mockResolvedValue({
    course: COURSE,
    groups: [
      group({ id: 'a', goal: 'Tuesday morning', meetingDay: 'Tuesday', meetingTime: '09:00' }),
      group({ id: 'b', goal: 'Friday lunch', meetingDay: 'Friday', meetingTime: '12:30' }),
      group({ id: 'c', goal: 'Wednesday evening', meetingDay: 'Wednesday', meetingTime: '18:00' }),
    ],
  });
  renderPage();
  await screen.findByText('Friday lunch');
  const titles = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
  expect(titles).toEqual(['Wednesday evening', 'Friday lunch', 'Tuesday morning']);
  vi.useRealTimers();
});

test('each card says how the viewer is related to the group', async () => {
  fetchCourseGroups.mockResolvedValue({
    course: COURSE,
    groups: [
      group({ id: 'l', goal: 'Led by me', viewerRole: 'leader' }),
      group({ id: 'm', goal: 'I am in', viewerRole: 'member' }),
      group({ id: 'p', goal: 'Asked', viewerRequestStatus: 'pending' }),
      group({ id: 's', goal: 'Stranger' }),
    ],
  });
  renderPage();
  const card = async (goal: string) => (await screen.findByRole('link', { name: goal })).closest('article')!;
  expect((await card('Led by me')).textContent).toContain('You lead');
  expect((await card('I am in')).textContent).toContain('You’re in');
  expect((await card('Asked')).textContent).toContain('Requested');
  expect((await card('Stranger')).textContent).not.toMatch(/You lead|You’re in|Requested/);
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

test('with no groups, offers one way to create the first and hides the filters', async () => {
  fetchCourseGroups.mockResolvedValue({ course: COURSE, groups: [] });
  renderPage();
  expect(await screen.findByRole('heading', { name: 'No study groups yet' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Create the first group' }).getAttribute('href')).toBe(
    '/groups/create?course=c1',
  );
  expect(screen.queryByLabelText('Day')).toBeNull();
  // Only the sidebar's Create Group remains; the page has a single call to action.
  expect(screen.getAllByRole('link', { name: 'Create group' })).toHaveLength(1);
});

test('opens a group from its card, which is one link named by the goal', async () => {
  fetchCourseGroups.mockResolvedValue({ course: COURSE, groups: GROUPS });
  const user = renderPage();
  await user.click(await screen.findByRole('link', { name: 'Review SOLID' }));
  expect(screen.getByRole('heading', { name: 'Details page' })).toBeTruthy();
});

test('an unknown course gets a way back, not filters or Create Group', async () => {
  fetchCourseGroups.mockRejectedValue(new ApiError(404, 'course_not_found', 'That course does not exist.'));
  const user = renderPage();
  expect(await screen.findByRole('heading', { name: 'Course not found' })).toBeTruthy();
  expect(screen.queryByLabelText('Day')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  await user.click(screen.getByRole('link', { name: 'Go to my courses' }));
  expect(screen.getByRole('heading', { name: 'My Courses page' })).toBeTruthy();
});

test('Back returns to My Courses', async () => {
  fetchCourseGroups.mockResolvedValue({ course: COURSE, groups: [] });
  const user = renderPage();
  await user.click(await screen.findByRole('link', { name: /Back to my courses/ }));
  expect(screen.getByRole('heading', { name: 'My Courses page' })).toBeTruthy();
});
