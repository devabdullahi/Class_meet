import type { ReactNode } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, ApiError, type CourseLinkCourse, type GroupSummary } from '../api';
import { JoinCoursePage } from './JoinCoursePage';

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Dev Student', email: 'dev@mavs.uta.edu' }, signOut: vi.fn() }),
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: { ...actual.api, fetchCourseByLinkCode: vi.fn(), enrollInCourse: vi.fn(), searchCourses: vi.fn() },
  };
});

const fetchCourseByLinkCode = vi.mocked(api.fetchCourseByLinkCode);
const enrollInCourse = vi.mocked(api.enrollInCourse);

const COURSE = { id: 'c1', code: 'CSE 3311', title: 'Object Oriented Software Engineering' };

function group(overrides: Partial<GroupSummary>): GroupSummary {
  return {
    id: 'g1',
    courseId: 'c1',
    name: 'Group',
    goal: 'Study',
    meetingDay: 'Tuesday',
    meetingTime: '18:00',
    format: 'in_person',
    location: 'Central Library, Room 315',
    maxMembers: 6,
    memberCount: 3,
    viewerRole: 'none',
    viewerRequestStatus: null,
    chatLink: null,
    hasChatLink: false,
    ...overrides,
  };
}

// Listed in no particular order: the page puts them soonest first.
const GROUPS = [
  group({ id: 'g6', name: 'Project 3 pair debugging', meetingDay: 'Monday', meetingTime: '14:00', maxMembers: 3 }),
  group({ id: 'g4', name: 'Quiz prep', meetingDay: 'Friday', meetingTime: '12:30' }),
  group({
    id: 'g3',
    name: 'Sprint check-in',
    meetingDay: 'Thursday',
    meetingTime: '19:30',
    format: 'online',
    location: null,
    maxMembers: 5,
  }),
  group({ id: 'g1', name: 'Midterm 2 crew' }),
  group({ id: 'g5', name: 'Saturday exam cram', meetingDay: 'Saturday', meetingTime: '10:00' }),
  group({ id: 'g2', name: 'Design patterns reading group', meetingDay: 'Wednesday', meetingTime: '16:00', maxMembers: 4 }),
];

function linkCourse(overrides: Partial<CourseLinkCourse> = {}): CourseLinkCourse {
  return { course: COURSE, enrolled: false, classmateCount: 41, groups: GROUPS, ...overrides };
}

/** Shows where the page sent the student, and what it told the next page. */
function GroupsPage(): ReactNode {
  const { pathname, state } = useLocation();
  return (
    <>
      <h1>Groups page</h1>
      <p data-testid="arrival">{`${pathname} ${JSON.stringify(state)}`}</p>
    </>
  );
}

beforeEach(() => {
  // A Monday afternoon: Monday's 2:00 PM group has met, so Tuesday's is next.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 16, 15, 0));
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.useRealTimers();
});

function renderPage(linkCode = 'CSE-3311') {
  render(
    <MemoryRouter initialEntries={[`/join/${linkCode}`]}>
      <Routes>
        <Route path="/join/:linkCode" element={<JoinCoursePage />} />
        <Route path="/groups/:courseId" element={<GroupsPage />} />
        <Route path="/" element={<h1>My courses page</h1>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

test('shows the course, its classmates, and the three groups meeting soonest', async () => {
  fetchCourseByLinkCode.mockResolvedValue(linkCourse());
  renderPage();
  expect(await screen.findByRole('heading', { level: 1, name: 'Object Oriented Software Engineering' })).toBeTruthy();
  expect(fetchCourseByLinkCode).toHaveBeenCalledWith('CSE-3311');
  expect(screen.getByText('CSE 3311')).toBeTruthy();
  expect(screen.getByText('41 students in this course already use Class Meet.')).toBeTruthy();
  expect(screen.getByRole('heading', { name: '6 study groups' })).toBeTruthy();
  expect(screen.getByText('5 have open seats. The next one meets Tuesday at 6:00 PM.')).toBeTruthy();

  const preview = within(screen.getByRole('region', { name: 'Meeting soonest' }));
  expect(preview.getAllByRole('listitem').map((item) => item.querySelector('.cm-preview__title')?.textContent)).toEqual([
    'Midterm 2 crew',
    'Design patterns reading group',
    'Sprint check-in',
  ]);
  expect(preview.getByText('Central Library, Room 315 · 3 seats left of 6')).toBeTruthy();
  expect(preview.getByText('Online · 2 seats left of 5')).toBeTruthy();
  expect(preview.getByText('3 more groups once you add the course.')).toBeTruthy();
  // A preview, not a way in: the groups open once the course is added.
  expect(preview.queryAllByRole('link')).toHaveLength(0);
});

test('adding the course goes to its groups, which say it was added', async () => {
  fetchCourseByLinkCode.mockResolvedValue(linkCourse());
  enrollInCourse.mockResolvedValue({ course: COURSE });
  const user = renderPage();
  await user.click(await screen.findByRole('button', { name: 'Add CSE 3311 to my courses' }));
  expect(enrollInCourse).toHaveBeenCalledWith('c1');
  expect(await screen.findByRole('heading', { name: 'Groups page' })).toBeTruthy();
  expect(screen.getByTestId('arrival').textContent).toBe('/groups/c1 {"courseLinkOutcome":"added"}');
});

test('when adding fails, says why and lets the student try again', async () => {
  fetchCourseByLinkCode.mockResolvedValue(linkCourse());
  enrollInCourse.mockRejectedValue(new ApiError(503, 'database_unavailable', 'Check DATABASE_URL in server/.env.'));
  const user = renderPage();
  await user.click(await screen.findByRole('button', { name: 'Add CSE 3311 to my courses' }));
  expect((await screen.findByRole('alert')).textContent).toBe('We could not add CSE 3311. Please try again.');
  expect((screen.getByRole('button', { name: 'Add CSE 3311 to my courses' }) as HTMLButtonElement).disabled).toBe(false);
});

test('a student who already has the course goes straight to its groups', async () => {
  fetchCourseByLinkCode.mockResolvedValue(linkCourse({ enrolled: true }));
  renderPage('cse-3311');
  expect(await screen.findByRole('heading', { name: 'Groups page' })).toBeTruthy();
  expect(screen.getByTestId('arrival').textContent).toBe('/groups/c1 {"courseLinkOutcome":"already_added"}');
});

test('a code the catalog does not know is named, with a way to search for the course', async () => {
  fetchCourseByLinkCode.mockRejectedValue(new ApiError(404, 'course_not_found', 'No course has that code.'));
  const user = renderPage('cse-3399');
  expect(await screen.findByRole('heading', { level: 1, name: 'We can’t find CSE 3399' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();

  const search = screen.getByRole('button', { name: 'Search courses' });
  await user.click(search);
  expect(screen.getByRole('dialog', { name: 'Add a course' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Done' }));
  expect(document.activeElement).toBe(search);

  await user.click(screen.getByRole('link', { name: /Back to my courses/ }));
  expect(screen.getByRole('heading', { name: 'My courses page' })).toBeTruthy();
});

test('when the server cannot answer, offers to try again', async () => {
  fetchCourseByLinkCode.mockRejectedValueOnce(new ApiError(503, 'database_unavailable', 'Check DATABASE_URL.'));
  fetchCourseByLinkCode.mockResolvedValueOnce(linkCourse());
  const user = renderPage();
  expect((await screen.findByRole('alert')).textContent).toContain('We could not open this course link. Please try again.');
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('heading', { name: '6 study groups' })).toBeTruthy();
});

test('a course with no groups yet offers to add it and start the first, without an empty preview', async () => {
  fetchCourseByLinkCode.mockResolvedValue(linkCourse({ groups: [], classmateCount: 0 }));
  renderPage();
  expect(await screen.findByRole('heading', { name: 'No study groups yet' })).toBeTruthy();
  expect(screen.getByText('You would be the first student in this course on Class Meet.')).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Meeting soonest' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Add CSE 3311 to my courses' })).toBeTruthy();
});

test('one group and one classmate are worded in the singular', async () => {
  fetchCourseByLinkCode.mockResolvedValue(linkCourse({ groups: [GROUPS[3]!], classmateCount: 1 }));
  renderPage();
  expect(await screen.findByRole('heading', { name: '1 study group' })).toBeTruthy();
  expect(screen.getByText('1 student in this course already uses Class Meet.')).toBeTruthy();
  expect(screen.getByText('It has open seats and meets Tuesday at 6:00 PM.')).toBeTruthy();
  expect(screen.queryByText(/more group/)).toBeNull();
});

test('says so when every group is full', async () => {
  const full = { memberCount: 4, maxMembers: 4 };
  fetchCourseByLinkCode.mockResolvedValue(
    linkCourse({ groups: [group({ id: 'a', ...full }), group({ id: 'b', meetingDay: 'Friday', ...full })] }),
  );
  renderPage();
  expect(await screen.findByText('All of them are full right now.')).toBeTruthy();
  expect(screen.getAllByText(/· Full$/)).toHaveLength(2);
});
