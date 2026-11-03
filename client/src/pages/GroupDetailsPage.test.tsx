import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { api, ApiError, type GroupDetails } from '../api';
import { downloadTextFile } from '../download';
import { GroupDetailsPage } from './GroupDetailsPage';

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Dev Student', email: 'dev@mavs.uta.edu' }, signOut: vi.fn() }),
}));

vi.mock('../download', () => ({ downloadTextFile: vi.fn() }));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: { ...actual.api, fetchGroup: vi.fn(), requestToJoin: vi.fn(), decideJoinRequest: vi.fn() },
  };
});

const fetchGroup = vi.mocked(api.fetchGroup);
const requestToJoin = vi.mocked(api.requestToJoin);
const decideJoinRequest = vi.mocked(api.decideJoinRequest);

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
    { userId: 'u8', name: 'Sam Lee', isLeader: false },
  ],
  viewerRole: 'none',
  viewerRequestStatus: null,
  pendingRequests: [],
};

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderPage(state?: { created: boolean }) {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/groups/c1/g1', state }]}>
      <Routes>
        <Route path="/groups/:courseId/:groupId" element={<GroupDetailsPage />} />
        <Route path="/groups/:courseId" element={<h1>Groups page</h1>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

test('shows the meeting information and the members, leader first', async () => {
  fetchGroup.mockResolvedValue({ group: BASE });
  renderPage();
  expect(await screen.findByRole('heading', { level: 1, name: 'Review SOLID' })).toBeTruthy();
  expect(fetchGroup).toHaveBeenCalledWith('g1');
  expect(screen.getByText('2:30 PM')).toBeTruthy();
  expect(screen.getByText(/Library 412/)).toBeTruthy();
  expect(screen.getByText(/2 \/ 6 members/)).toBeTruthy();
  expect(screen.getByText('Alex Rivera — Group Leader')).toBeTruthy();
  expect(screen.getByText('Sam Lee')).toBeTruthy();
});

test('an online group links to its meeting link', async () => {
  fetchGroup.mockResolvedValue({ group: { ...BASE, format: 'online', location: 'https://meet.example/room' } });
  renderPage();
  const link = await screen.findByRole('link', { name: 'https://meet.example/room' });
  expect(link.getAttribute('href')).toBe('https://meet.example/room');
  expect(link.getAttribute('rel')).toContain('noopener');
});

test('a student outside the group can request to join, and the page refreshes', async () => {
  fetchGroup
    .mockResolvedValueOnce({ group: BASE })
    .mockResolvedValue({ group: { ...BASE, viewerRequestStatus: 'pending' } });
  requestToJoin.mockResolvedValue({ status: 'pending' });
  const user = renderPage();
  await user.click(await screen.findByRole('button', { name: 'Request to Join' }));
  expect(requestToJoin).toHaveBeenCalledWith('g1');
  expect(await screen.findByText(/Request pending/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Request to Join' })).toBeNull();
});

test('a declined student can ask again', async () => {
  fetchGroup.mockResolvedValue({ group: { ...BASE, viewerRequestStatus: 'declined' } });
  renderPage();
  expect(await screen.findByRole('button', { name: 'Ask Again' })).toBeTruthy();
});

test('a full group cannot be joined', async () => {
  fetchGroup.mockResolvedValue({ group: { ...BASE, memberCount: 6 } });
  renderPage();
  const button = (await screen.findByRole('button', { name: 'Group Full' })) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
});

test('people outside the group do not see the calendar options', async () => {
  fetchGroup.mockResolvedValue({ group: BASE });
  renderPage();
  await screen.findByRole('heading', { name: 'Review SOLID' });
  expect(screen.queryByText('Add to your calendar')).toBeNull();
});

test('shows the server message when joining fails', async () => {
  fetchGroup.mockResolvedValue({ group: BASE });
  requestToJoin.mockRejectedValue(new ApiError(409, 'group_full', 'This group is full.'));
  const user = renderPage();
  await user.click(await screen.findByRole('button', { name: 'Request to Join' }));
  expect((await screen.findByRole('alert')).textContent).toBe('This group is full.');
});

test('a member can add the weekly meeting to their calendar', async () => {
  fetchGroup.mockResolvedValue({ group: { ...BASE, viewerRole: 'member' } });
  const user = renderPage();
  await screen.findByText('Add to your calendar');
  await user.click(screen.getByRole('button', { name: 'Download .ics' }));
  expect(downloadTextFile).toHaveBeenCalledTimes(1);
  const [fileName, content, mimeType] = vi.mocked(downloadTextFile).mock.calls[0]!;
  expect(fileName).toBe('CSE-3311-study-group.ics');
  expect(content).toContain('RRULE:FREQ=WEEKLY;BYDAY=TU');
  expect(content).toContain('SUMMARY:CSE 3311 study group');
  expect(mimeType).toContain('text/calendar');
  const google = screen.getByRole('link', { name: 'Add to Google Calendar' });
  expect(google.getAttribute('href')).toContain('https://calendar.google.com/calendar/render');
  expect(google.getAttribute('href')).toContain('BYDAY%3DTU');
});

test('the leader sees a created banner, the calendar options and join requests to answer', async () => {
  fetchGroup.mockResolvedValue({
    group: { ...BASE, viewerRole: 'leader', pendingRequests: [{ id: 'r1', userId: 'u7', name: 'Jo Kim' }] },
  });
  renderPage({ created: true });
  expect((await screen.findByRole('status')).textContent).toBe('Your group was created. You are its leader.');
  expect(screen.getByText('Jo Kim')).toBeTruthy();
  expect(screen.getByText('Add to your calendar')).toBeTruthy();
});

test('the leader can approve a request, and the list refreshes', async () => {
  fetchGroup
    .mockResolvedValueOnce({
      group: { ...BASE, viewerRole: 'leader', pendingRequests: [{ id: 'r1', userId: 'u7', name: 'Jo Kim' }] },
    })
    .mockResolvedValue({ group: { ...BASE, viewerRole: 'leader', memberCount: 3 } });
  decideJoinRequest.mockResolvedValue({ group: BASE });
  const user = renderPage();
  await user.click(await screen.findByRole('button', { name: 'Approve Jo Kim' }));
  expect(decideJoinRequest).toHaveBeenCalledWith('g1', 'r1', 'approve');
  await waitFor(() => expect(screen.getByText('No one is waiting to join.')).toBeTruthy());
});

test('the leader can decline a request', async () => {
  fetchGroup.mockResolvedValue({
    group: { ...BASE, viewerRole: 'leader', pendingRequests: [{ id: 'r1', userId: 'u7', name: 'Jo Kim' }] },
  });
  decideJoinRequest.mockResolvedValue({ group: BASE });
  const user = renderPage();
  await user.click(await screen.findByRole('button', { name: 'Decline Jo Kim' }));
  expect(decideJoinRequest).toHaveBeenCalledWith('g1', 'r1', 'decline');
});

test('shows the server message when the group does not exist', async () => {
  fetchGroup.mockRejectedValue(new ApiError(404, 'group_not_found', 'That group does not exist.'));
  renderPage();
  expect((await screen.findByRole('alert')).textContent).toBe('That group does not exist.');
});
