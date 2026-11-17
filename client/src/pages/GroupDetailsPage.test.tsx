import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { api, ApiError, type GroupDetails } from '../api';
import { downloadTextFile } from '../download';
import { GroupDetailsPage } from './GroupDetailsPage';

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u8', name: 'Sam Lee', email: 'sam@mavs.uta.edu' }, signOut: vi.fn() }),
}));

vi.mock('../download', () => ({ downloadTextFile: vi.fn() }));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      fetchGroup: vi.fn(),
      requestToJoin: vi.fn(),
      withdrawJoinRequest: vi.fn(),
      decideJoinRequest: vi.fn(),
    },
  };
});

const fetchGroup = vi.mocked(api.fetchGroup);
const requestToJoin = vi.mocked(api.requestToJoin);
const withdrawJoinRequest = vi.mocked(api.withdrawJoinRequest);
const decideJoinRequest = vi.mocked(api.decideJoinRequest);

/** Seen by Sam, who is not in it. */
const BASE: GroupDetails = {
  id: 'g1',
  courseId: 'c1',
  courseCode: 'CSE 3311',
  courseTitle: 'Object Oriented Software Engineering',
  goal: 'Review SOLID',
  meetingDay: 'Tuesday',
  meetingTime: '14:30',
  format: 'in_person',
  location: 'Library 412',
  maxMembers: 6,
  memberCount: 2,
  members: [
    { userId: 'u9', name: 'Alex Rivera', isLeader: true },
    { userId: 'u7', name: 'Jo Kim', isLeader: false },
  ],
  viewerRole: 'none',
  viewerRequestStatus: null,
  pendingRequests: [],
};

const AS_MEMBER: GroupDetails = {
  ...BASE,
  viewerRole: 'member',
  memberCount: 3,
  members: [...BASE.members, { userId: 'u8', name: 'Sam Lee', isLeader: false }],
};

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderPage(state?: { created: boolean }, path = '/groups/c1/g1') {
  render(
    <MemoryRouter initialEntries={[{ pathname: path, state }]}>
      <Routes>
        <Route path="/groups/:courseId/:groupId" element={<GroupDetailsPage />} />
        <Route path="/groups/:courseId" element={<h1>Groups page</h1>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

const actionPanel = () => screen.getAllByRole('region')[0]!;

test('shows the meeting, seats left and the members, leader first', async () => {
  fetchGroup.mockResolvedValue({ group: BASE });
  renderPage();
  expect(await screen.findByRole('heading', { level: 1, name: 'Review SOLID' })).toBeTruthy();
  expect(fetchGroup).toHaveBeenCalledWith('g1');
  expect(screen.getByText('Weekly · 1 hour')).toBeTruthy();
  expect(screen.getByText(/^Next: Tue/)).toBeTruthy();
  expect(screen.getByText('Library 412')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Members · 2 of 6' })).toBeTruthy();
  expect(screen.getByText('Leader: Alex Rivera')).toBeTruthy();
  const members = within(screen.getByRole('list')).getAllByRole('listitem');
  expect(members[0]!.textContent).toContain('Alex Rivera');
});

test('a long goal is repeated in full in the Meeting panel; a short one is not', async () => {
  const longGoal = 'Review '.repeat(40).trim();
  fetchGroup.mockResolvedValue({ group: { ...BASE, goal: longGoal } });
  renderPage();
  await screen.findByRole('heading', { level: 1 });
  expect(screen.getAllByText(longGoal)).toHaveLength(2);
  cleanup();
  fetchGroup.mockResolvedValue({ group: BASE });
  renderPage();
  await screen.findByRole('heading', { level: 1 });
  expect(screen.getAllByText('Review SOLID')).toHaveLength(1);
});

test('marks the viewer in the member list', async () => {
  fetchGroup.mockResolvedValue({ group: AS_MEMBER });
  renderPage();
  expect(await screen.findByText('(you)')).toBeTruthy();
});

test('the action panel comes first on the page', async () => {
  fetchGroup.mockResolvedValue({ group: BASE });
  renderPage();
  await screen.findByRole('heading', { level: 1 });
  const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
  expect(headings[0]).toBe('4 seats left');
});

test('a student outside an online group is told the link is for members', async () => {
  fetchGroup.mockResolvedValue({ group: { ...BASE, format: 'online', location: null } });
  renderPage();
  expect(await screen.findByText('The meeting link is shared with members.')).toBeTruthy();
  expect(screen.queryByRole('link', { name: /Join meeting/ })).toBeNull();
});

test('a member of an online group gets Join meeting as the main action', async () => {
  fetchGroup.mockResolvedValue({
    group: { ...AS_MEMBER, format: 'online', location: 'https://zoom.us/j/1234567890' },
  });
  renderPage();
  const join = await screen.findByRole('link', { name: /Join meeting/ });
  expect(join.getAttribute('href')).toBe('https://zoom.us/j/1234567890');
  expect(join.getAttribute('rel')).toContain('noopener');
  expect(join.className).toContain('cm-btn--primary');
  expect(screen.getByText('Opens Zoom in a new tab.')).toBeTruthy();
});

test('a member of an in-person group is told where to meet', async () => {
  fetchGroup.mockResolvedValue({ group: AS_MEMBER });
  renderPage();
  expect((await screen.findByText(/^Meet at/)).textContent).toBe('Meet at Library 412');
});

test('a student outside the group can request to join, and the panel then says it was sent', async () => {
  fetchGroup
    .mockResolvedValueOnce({ group: BASE })
    .mockResolvedValue({ group: { ...BASE, viewerRequestStatus: 'pending' } });
  requestToJoin.mockResolvedValue({ status: 'pending' });
  const user = renderPage();
  await user.click(await screen.findByRole('button', { name: 'Request to join' }));
  expect(requestToJoin).toHaveBeenCalledWith('g1');
  expect(await screen.findByRole('heading', { name: 'Request sent' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Request to join' })).toBeNull();
});

test('a pending request can be withdrawn', async () => {
  fetchGroup
    .mockResolvedValueOnce({ group: { ...BASE, viewerRequestStatus: 'pending' } })
    .mockResolvedValue({ group: BASE });
  withdrawJoinRequest.mockResolvedValue(null);
  const user = renderPage();
  await user.click(await screen.findByRole('button', { name: 'Withdraw request' }));
  expect(withdrawJoinRequest).toHaveBeenCalledWith('g1');
  expect(await screen.findByRole('button', { name: 'Request to join' })).toBeTruthy();
});

test('a declined student can ask again, as a secondary action', async () => {
  fetchGroup.mockResolvedValue({ group: { ...BASE, viewerRequestStatus: 'declined' } });
  renderPage();
  const askAgain = await screen.findByRole('button', { name: 'Ask again' });
  expect(askAgain.className).toContain('cm-btn--secondary');
  expect(screen.getByText(/Alex Rivera declined your last request/)).toBeTruthy();
});

test('a full group says so and points to the course\'s other groups, with no button', async () => {
  fetchGroup.mockResolvedValue({ group: { ...BASE, memberCount: 6 } });
  const user = renderPage();
  expect(await screen.findByRole('heading', { name: 'This group is full' })).toBeTruthy();
  expect(within(actionPanel()).queryByRole('button')).toBeNull();
  await user.click(screen.getByRole('link', { name: 'See other CSE 3311 groups' }));
  expect(screen.getByRole('heading', { name: 'Groups page' })).toBeTruthy();
});

test('people outside the group do not see the calendar options', async () => {
  fetchGroup.mockResolvedValue({ group: BASE });
  renderPage();
  await screen.findByRole('heading', { name: 'Review SOLID' });
  expect(screen.queryByRole('button', { name: /Add to calendar/ })).toBeNull();
});

test('shows the server message when joining fails', async () => {
  fetchGroup.mockResolvedValue({ group: BASE });
  requestToJoin.mockRejectedValue(new ApiError(409, 'group_full', 'This group is full.'));
  const user = renderPage();
  await user.click(await screen.findByRole('button', { name: 'Request to join' }));
  expect((await screen.findByRole('alert')).textContent).toBe('This group is full.');
});

test('a member can add the weekly meeting to their calendar', async () => {
  fetchGroup.mockResolvedValue({ group: AS_MEMBER });
  const user = renderPage();
  const toggle = await screen.findByRole('button', { name: /Add to calendar/ });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByRole('button', { name: 'Download .ics file' })).toBeNull();
  await user.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  await user.click(screen.getByRole('button', { name: 'Download .ics file' }));
  expect(downloadTextFile).toHaveBeenCalledTimes(1);
  const [fileName, content, mimeType] = vi.mocked(downloadTextFile).mock.calls[0]!;
  expect(fileName).toBe('CSE-3311-study-group.ics');
  expect(content).toContain('RRULE:FREQ=WEEKLY;BYDAY=TU');
  expect(content).toContain('SUMMARY:CSE 3311 study group');
  expect(mimeType).toContain('text/calendar');
  const google = screen.getByRole('link', { name: 'Google Calendar' });
  expect(google.getAttribute('href')).toContain('https://calendar.google.com/calendar/render');
  expect(google.getAttribute('href')).toContain('BYDAY%3DTU');
});

test('the leader sees a created notice, the join requests with a count, and the calendar', async () => {
  fetchGroup.mockResolvedValue({
    group: { ...BASE, viewerRole: 'leader', pendingRequests: [{ id: 'r1', userId: 'u5', name: 'Pat Doe' }] },
  });
  renderPage({ created: true });
  expect((await screen.findByRole('status')).textContent).toMatch(/Group created\. You lead it/);
  expect(screen.getByRole('heading', { name: 'Join requests (1)' })).toBeTruthy();
  expect(screen.getByText('Pat Doe')).toBeTruthy();
  expect(screen.getByRole('button', { name: /Add to calendar/ })).toBeTruthy();
});

test('the leader can approve a request, and the list refreshes', async () => {
  fetchGroup
    .mockResolvedValueOnce({
      group: { ...BASE, viewerRole: 'leader', pendingRequests: [{ id: 'r1', userId: 'u5', name: 'Pat Doe' }] },
    })
    .mockResolvedValue({ group: { ...BASE, viewerRole: 'leader', memberCount: 3 } });
  decideJoinRequest.mockResolvedValue({ group: BASE });
  const user = renderPage();
  const approve = await screen.findByRole('button', { name: 'Approve Pat Doe' });
  expect(approve.className).toContain('cm-btn--secondary');
  await user.click(approve);
  expect(decideJoinRequest).toHaveBeenCalledWith('g1', 'r1', 'approve');
  await waitFor(() => expect(screen.getByText('No one is waiting to join.')).toBeTruthy());
});

test('the leader can decline a request', async () => {
  fetchGroup.mockResolvedValue({
    group: { ...BASE, viewerRole: 'leader', pendingRequests: [{ id: 'r1', userId: 'u5', name: 'Pat Doe' }] },
  });
  decideJoinRequest.mockResolvedValue({ group: BASE });
  const user = renderPage();
  await user.click(await screen.findByRole('button', { name: 'Decline Pat Doe' }));
  expect(decideJoinRequest).toHaveBeenCalledWith('g1', 'r1', 'decline');
});

test('a group that does not exist gets a way back instead of Try again', async () => {
  fetchGroup.mockRejectedValue(new ApiError(404, 'group_not_found', 'That group does not exist.'));
  const user = renderPage();
  expect(await screen.findByRole('heading', { name: 'Group not found' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  await user.click(screen.getByRole('link', { name: 'See this course’s groups' }));
  expect(screen.getByRole('heading', { name: 'Groups page' })).toBeTruthy();
});

test('a server failure offers Try again', async () => {
  fetchGroup.mockRejectedValue(new ApiError(503, 'database_unavailable', 'Check DATABASE_URL.'));
  renderPage();
  expect((await screen.findByRole('alert')).textContent).toContain('We could not load this group.');
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
});
