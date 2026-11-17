import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { api, ApiError, type GroupSummary } from '../api';
import type { CourseLinkOutcome } from '../courseLink';
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
    name: null,
    goal: 'Review SOLID',
    meetingDay: 'Tuesday',
    meetingTime: '14:30',
    format: 'in_person',
    location: 'Library 412',
    maxMembers: 6,
    memberCount: 2,
    chatLink: null,
    hasChatLink: false,
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

function renderPage(state?: { deletedGroupTitle?: string; courseLinkOutcome?: CourseLinkOutcome }) {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/groups/c1', state }]}>
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
  fetchCourseGroups.mockResolvedValue({ course: COURSE, classmateCount: 12, groups: GROUPS });
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
    classmateCount: 12,
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
    classmateCount: 12,
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
    classmateCount: 12,
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
  fetchCourseGroups.mockResolvedValue({ course: COURSE, classmateCount: 12, groups: GROUPS });
  const user = renderPage();
  await screen.findByText('Review SOLID');
  await user.selectOptions(screen.getByLabelText('Format'), 'Online');
  expect(screen.getByText('UML practice')).toBeTruthy();
  expect(screen.queryByText('Review SOLID')).toBeNull();
});

test('filters by day and by availability', async () => {
  fetchCourseGroups.mockResolvedValue({ course: COURSE, classmateCount: 12, groups: GROUPS });
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
  fetchCourseGroups.mockResolvedValue({ course: COURSE, classmateCount: 12, groups: GROUPS });
  const user = renderPage();
  await screen.findByText('Review SOLID');
  await user.selectOptions(screen.getByLabelText('Day'), 'Monday');
  expect(screen.getByRole('heading', { name: 'No groups match these filters' })).toBeTruthy();
});

const COURSE_LINK = `${window.location.origin}/join/CSE-3311`;

test('with no groups, the classmates who have the course are the reason to start the first one', async () => {
  fetchCourseGroups.mockResolvedValue({ course: COURSE, classmateCount: 38, groups: [] });
  renderPage();
  expect(await screen.findByRole('heading', { name: '38 classmates in CSE 3311 use Class Meet' })).toBeTruthy();
  expect(screen.getByText(/None of them has started a study group yet/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Create the first group' }).getAttribute('href')).toBe(
    '/groups/create?course=c1',
  );
  expect(screen.getByRole('button', { name: 'Share course link' })).toBeTruthy();
  expect(screen.queryByLabelText('Day')).toBeNull();
  // Only the sidebar's Create Group remains; the page has a single call to action.
  expect(screen.getAllByRole('link', { name: 'Create group' })).toHaveLength(1);
});

test('one classmate is counted in the singular', async () => {
  fetchCourseGroups.mockResolvedValue({ course: COURSE, classmateCount: 1, groups: [] });
  renderPage();
  expect(await screen.findByRole('heading', { name: '1 classmate in CSE 3311 uses Class Meet' })).toBeTruthy();
  expect(screen.getByText(/They have not started a study group yet/)).toBeTruthy();
});

test('the first student in a course is offered the course link to share, and a group anyway', async () => {
  fetchCourseGroups.mockResolvedValue({ course: COURSE, classmateCount: 0, groups: [] });
  const user = renderPage();
  expect(await screen.findByRole('heading', { name: 'You’re the first CSE 3311 student here' })).toBeTruthy();
  expect((screen.getByRole('textbox', { name: 'Course link' }) as HTMLInputElement).value).toBe(COURSE_LINK);
  expect(screen.getByRole('link', { name: 'Create a group anyway' }).getAttribute('href')).toBe(
    '/groups/create?course=c1',
  );
  expect(screen.queryByRole('link', { name: 'Create the first group' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Share course link' })).toBeNull();

  await user.click(screen.getByRole('button', { name: 'Copy link' }));
  expect(await navigator.clipboard.readText()).toBe(COURSE_LINK);
  expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
});

test('Share course link opens the link to copy, and closing it returns to the button', async () => {
  fetchCourseGroups.mockResolvedValue({ course: COURSE, classmateCount: 12, groups: GROUPS });
  const user = renderPage();
  const share = await screen.findByRole('button', { name: 'Share course link' });
  await user.click(share);

  const dialog = screen.getByRole('dialog', { name: 'Share CSE 3311' });
  expect(within(dialog).getByText(/can add CSE 3311 in one tap/)).toBeTruthy();
  expect((within(dialog).getByLabelText('Course link') as HTMLInputElement).value).toBe(COURSE_LINK);
  const copy = within(dialog).getByRole('button', { name: 'Copy link' });
  expect(document.activeElement).toBe(copy);

  await user.click(copy);
  expect(await navigator.clipboard.readText()).toBe(COURSE_LINK);
  expect(within(dialog).getByRole('status').textContent).toBe('Link copied.');

  await user.click(within(dialog).getByRole('button', { name: 'Done' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(share);

  await user.click(share);
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(share);
});

test('opens a group from its card, which is one link named by the goal when the group has no name', async () => {
  fetchCourseGroups.mockResolvedValue({ course: COURSE, classmateCount: 12, groups: GROUPS });
  const user = renderPage();
  await user.click(await screen.findByRole('link', { name: 'Review SOLID' }));
  expect(screen.getByRole('heading', { name: 'Details page' })).toBeTruthy();
});

test('a named group is titled by its name, with the goal on the line under it', async () => {
  fetchCourseGroups.mockResolvedValue({
    course: COURSE,
    classmateCount: 12,
    groups: [group({ id: 'g7', name: 'Midterm crew', goal: 'Review SOLID' })],
  });
  renderPage();
  expect(await screen.findByRole('link', { name: 'Midterm crew' })).toBeTruthy();
  expect(screen.getByRole('heading', { level: 2, name: 'Midterm crew' })).toBeTruthy();
  expect(screen.getByText('Review SOLID', { selector: 'p' })).toBeTruthy();
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

test('a course just added from its link says so', async () => {
  fetchCourseGroups.mockResolvedValue({ course: COURSE, classmateCount: 12, groups: GROUPS });
  renderPage({ courseLinkOutcome: 'added' });
  expect((await screen.findByRole('status')).textContent).toBe('CSE 3311 was added to your courses.');
});

test('a course link to a course the student already has says why they are here', async () => {
  fetchCourseGroups.mockResolvedValue({ course: COURSE, classmateCount: 12, groups: GROUPS });
  renderPage({ courseLinkOutcome: 'already_added' });
  expect((await screen.findByRole('status')).textContent).toBe(
    'CSE 3311 is already in your courses, so the link brought you straight to its groups.',
  );
});

test('Back returns to My Courses', async () => {
  fetchCourseGroups.mockResolvedValue({ course: COURSE, classmateCount: 12, groups: [] });
  const user = renderPage();
  await user.click(await screen.findByRole('link', { name: /Back to my courses/ }));
  expect(screen.getByRole('heading', { name: 'My Courses page' })).toBeTruthy();
});

test('after its leader deletes a group, the course\'s groups say it was deleted', async () => {
  fetchCourseGroups.mockResolvedValue({ course: COURSE, classmateCount: 12, groups: GROUPS });
  renderPage({ deletedGroupTitle: 'Pattern crew' });
  expect((await screen.findByRole('status')).textContent).toBe('Pattern crew was deleted.');
});
