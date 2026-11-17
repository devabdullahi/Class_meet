import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { api, ApiError, type LedGroupSummary, type MyGroupSummary } from '../api';
import { MyGroupsPage } from './MyGroupsPage';

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Dev Student', email: 'dev@mavs.uta.edu' }, signOut: vi.fn() }),
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, api: { ...actual.api, fetchMyGroups: vi.fn() } };
});

const fetchMyGroups = vi.mocked(api.fetchMyGroups);

const BASE: MyGroupSummary = {
  id: 'g',
  courseId: 'c1',
  courseCode: 'CSE 3311',
  courseTitle: 'Object Oriented Software Engineering',
  name: null,
  goal: 'Group',
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
};

function led(id: string, goal: string, pendingRequestCount: number): LedGroupSummary {
  return { ...BASE, id, goal, viewerRole: 'leader', pendingRequestCount };
}

const QUIET = led('g-quiet', 'Quiet group', 0);
const ONE_WAITING = led('g-one', 'One request', 1);
const BUSY = led('g-busy', 'Busy group', 3);
const MEMBER: MyGroupSummary = {
  ...BASE,
  id: 'g-member',
  goal: 'Sprint check-in',
  courseCode: 'CSE 4308',
  format: 'online',
  location: 'https://zoom.us/j/1',
  viewerRole: 'member',
};
const DECLINED: MyGroupSummary = { ...BASE, id: 'g-declined', goal: 'Reading group', viewerRequestStatus: 'declined' };
const PENDING: MyGroupSummary = { ...BASE, id: 'g-pending', goal: 'Quiz prep', viewerRequestStatus: 'pending' };

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/my-groups']}>
      <Routes>
        <Route path="/my-groups" element={<MyGroupsPage />} />
        <Route path="/groups/:courseId/:groupId" element={<h1>Group details page</h1>} />
        <Route path="/groups/create" element={<h1>Create Group page</h1>} />
        <Route path="/" element={<h1>My Courses page</h1>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

const cardTitles = (section: HTMLElement) =>
  within(section)
    .getAllByRole('heading', { level: 3 })
    .map((heading) => heading.textContent);

test('groups you lead come first, those with the most requests waiting at the top', async () => {
  fetchMyGroups.mockResolvedValue({ leading: [QUIET, ONE_WAITING, BUSY], member: [MEMBER], requested: [PENDING] });
  renderPage();
  const sections = await screen.findAllByRole('region');
  expect(sections.map((section) => section.getAttribute('aria-labelledby'))).toEqual([
    'leading-heading',
    'member-heading',
    'requested-heading',
  ]);
  expect(screen.getByRole('heading', { level: 2, name: 'You lead · 3' })).toBeTruthy();
  expect(cardTitles(sections[0]!)).toEqual(['Busy group', 'One request', 'Quiet group']);
});

test('a group you lead shows its waiting requests as a number, or how full it is when none wait', async () => {
  fetchMyGroups.mockResolvedValue({ leading: [BUSY, ONE_WAITING, QUIET], member: [], requested: [] });
  renderPage();
  const [busy, one, quiet] = await screen.findAllByRole('article');
  expect(busy!.textContent).toContain('3 requests waiting');
  expect(within(busy!).getByText('3').tagName).toBe('STRONG');
  expect(one!.textContent).toContain('1 request waiting');
  expect(quiet!.textContent).not.toContain('waiting');
  expect(quiet!.textContent).toContain('4 seats left of 6');
});

test('a group you are in says where it meets, with its course', async () => {
  fetchMyGroups.mockResolvedValue({ leading: [], member: [MEMBER], requested: [] });
  renderPage();
  const card = await screen.findByRole('article');
  expect(card.textContent).toContain('CSE 4308');
  expect(card.textContent).toContain('Online · Zoom');
});

test('pending requests are listed before declined ones, each with its status', async () => {
  fetchMyGroups.mockResolvedValue({ leading: [], member: [], requested: [DECLINED, PENDING] });
  renderPage();
  const [first, second] = await screen.findAllByRole('article');
  expect(first!.textContent).toContain('Quiz prep');
  expect(first!.textContent).toContain('Requested · waiting for the leader');
  expect(second!.textContent).toContain('Reading group');
  expect(second!.textContent).toContain('Declined · you can ask again');
});

test('each card is one link to the group', async () => {
  fetchMyGroups.mockResolvedValue({ leading: [BUSY], member: [], requested: [] });
  const user = renderPage();
  await user.click(await screen.findByRole('link', { name: 'Busy group' }));
  expect(screen.getByRole('heading', { name: 'Group details page' })).toBeTruthy();
});

test('with no groups, it invites the student to find a group or start one', async () => {
  fetchMyGroups.mockResolvedValue({ leading: [], member: [], requested: [] });
  const user = renderPage();
  expect(await screen.findByRole('heading', { name: 'No groups yet' })).toBeTruthy();
  expect(screen.queryAllByRole('region')).toHaveLength(0);
  await user.click(screen.getByRole('link', { name: 'Find a group' }));
  expect(screen.getByRole('heading', { name: 'My Courses page' })).toBeTruthy();
});

test('says plainly when the groups cannot be loaded, without server details', async () => {
  fetchMyGroups
    .mockRejectedValueOnce(new ApiError(503, 'database_unavailable', 'Check DATABASE_URL in server/.env.'))
    .mockResolvedValue({ leading: [BUSY], member: [], requested: [] });
  const user = renderPage();
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('We could not load your groups. Please try again.');
  expect(alert.textContent).not.toContain('DATABASE_URL');
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('link', { name: 'Busy group' })).toBeTruthy();
});
