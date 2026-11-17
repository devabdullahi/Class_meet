import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, ApiError, type GroupDetails } from '../api';
import { downloadTextFile } from '../download';
import { PendingRequestsProvider } from '../pending-requests/PendingRequestsProvider';
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
      leaveGroup: vi.fn(),
      deleteGroup: vi.fn(),
      fetchPendingRequestCount: vi.fn(),
      fetchProfile: vi.fn(),
    },
  };
});

const fetchGroup = vi.mocked(api.fetchGroup);
const requestToJoin = vi.mocked(api.requestToJoin);
const withdrawJoinRequest = vi.mocked(api.withdrawJoinRequest);
const decideJoinRequest = vi.mocked(api.decideJoinRequest);
const leaveGroup = vi.mocked(api.leaveGroup);
const deleteGroup = vi.mocked(api.deleteGroup);
const fetchPendingRequestCount = vi.mocked(api.fetchPendingRequestCount);
const fetchProfile = vi.mocked(api.fetchProfile);

/** Seen by Sam, who is not in it. */
const BASE: GroupDetails = {
  id: 'g1',
  courseId: 'c1',
  courseCode: 'CSE 3311',
  courseTitle: 'Object Oriented Software Engineering',
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

beforeEach(() => {
  fetchProfile.mockResolvedValue({ profile: null });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

/** Stands in for the profile page, showing where saving would return to. */
function ProfileRoute() {
  const { state } = useLocation();
  return <h1>Profile page, back to {(state as { returnTo?: string } | null)?.returnTo}</h1>;
}

function renderPage(state?: { created?: boolean; saved?: boolean }, path = '/groups/c1/g1') {
  render(
    <MemoryRouter initialEntries={[{ pathname: path, state }]}>
      <Routes>
        <Route path="/groups/:courseId/:groupId" element={<GroupDetailsPage />} />
        <Route path="/groups/:courseId/:groupId/edit" element={<h1>Edit page</h1>} />
        <Route path="/groups/:courseId" element={<h1>Groups page</h1>} />
        <Route path="/profile" element={<ProfileRoute />} />
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

test('a named group is headed by its name, with the whole goal under it and not repeated', async () => {
  const longGoal = 'Review '.repeat(40).trim();
  fetchGroup.mockResolvedValue({ group: { ...BASE, name: 'Midterm crew', goal: longGoal } });
  renderPage();
  expect(await screen.findByRole('heading', { level: 1, name: 'Midterm crew' })).toBeTruthy();
  expect(screen.getAllByText(longGoal)).toHaveLength(1);
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

test('a student without a profile is told the leader will see only their name, and can add one', async () => {
  fetchGroup.mockResolvedValue({ group: BASE });
  const user = renderPage();
  const note = await within(await screen.findByRole('region', { name: '4 seats left' })).findByText(
    /The leader will see only your name\./,
  );
  expect(note.textContent).toBe(
    'The leader will see only your name. Add a profile so they know your major and how you study.',
  );
  await user.click(screen.getByRole('link', { name: 'Add a profile' }));
  expect(await screen.findByRole('heading', { name: 'Profile page, back to /groups/c1/g1' })).toBeTruthy();
});

test('a student who has a profile, or whose request is already sent, gets no note about it', async () => {
  fetchProfile.mockResolvedValue({
    profile: { major: 'Physics', year: null, meetingPreference: null, studyStyles: [] },
  });
  fetchGroup.mockResolvedValue({ group: BASE });
  renderPage();
  await screen.findByRole('button', { name: 'Request to join' });
  await waitFor(() => expect(fetchProfile).toHaveBeenCalled());
  expect(screen.queryByText(/Add a profile/)).toBeNull();

  cleanup();
  fetchProfile.mockResolvedValue({ profile: null });
  fetchGroup.mockResolvedValue({ group: { ...BASE, viewerRequestStatus: 'pending' } });
  renderPage();
  await screen.findByRole('heading', { name: 'Request sent' });
  expect(screen.queryByText(/Add a profile/)).toBeNull();
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
    group: { ...BASE, viewerRole: 'leader', pendingRequests: [{ id: 'r1', userId: 'u5', name: 'Pat Doe', profile: null }] },
  });
  renderPage({ created: true });
  expect((await screen.findByRole('status')).textContent).toMatch(/Group created\. You lead it/);
  expect(screen.getByRole('heading', { name: 'Join requests (1)' })).toBeTruthy();
  expect(screen.getByText('Pat Doe')).toBeTruthy();
  expect(screen.getByRole('button', { name: /Add to calendar/ })).toBeTruthy();
});

test('the leader sees what each waiting student\'s profile says, or that they have not added one', async () => {
  fetchGroup.mockResolvedValue({
    group: {
      ...BASE,
      viewerRole: 'leader',
      pendingRequests: [
        {
          id: 'r1',
          userId: 'u5',
          name: 'Jordan Reyes',
          profile: {
            major: 'Computer Science',
            year: 'sophomore',
            meetingPreference: 'either',
            studyStyles: ['practice_problems', 'talking_it_through'],
          },
        },
        { id: 'r2', userId: 'u6', name: 'Lena Fischer', profile: null },
      ],
    },
  });
  renderPage();
  const requests = within(await screen.findByRole('region', { name: 'Join requests (2)' })).getAllByRole('listitem');
  expect(within(requests[0]!).getByText('Jordan Reyes')).toBeTruthy();
  expect(requests[0]!.textContent).toContain('Computer Science · Sophomore · Online or on campus');
  expect(within(requests[0]!).getByText('Studies by practice problems and talking it through')).toBeTruthy();
  expect(within(requests[1]!).getByText('Has not added a profile yet')).toBeTruthy();
  expect(within(requests[1]!).getByRole('button', { name: 'Approve Lena Fischer' })).toBeTruthy();
});

test('the leader can open Edit group; members and other students cannot', async () => {
  fetchGroup.mockResolvedValue({ group: { ...BASE, viewerRole: 'leader' } });
  const user = renderPage();
  await user.click(await screen.findByRole('link', { name: 'Edit group' }));
  expect(screen.getByRole('heading', { name: 'Edit page' })).toBeTruthy();
  for (const group of [AS_MEMBER, BASE]) {
    cleanup();
    fetchGroup.mockResolvedValue({ group });
    renderPage();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('link', { name: 'Edit group' })).toBeNull();
  }
});

test('after an edit, the group says the changes were saved', async () => {
  fetchGroup.mockResolvedValue({ group: { ...BASE, viewerRole: 'leader' } });
  renderPage({ saved: true });
  expect((await screen.findByRole('status')).textContent).toBe('Changes saved.');
});

test('only a member, not the leader or a stranger, is offered Leave group', async () => {
  fetchGroup.mockResolvedValue({ group: AS_MEMBER });
  renderPage();
  const leave = await screen.findByRole('button', { name: 'Leave group' });
  expect(leave.className).toContain('cm-btn--quiet');
  for (const group of [{ ...BASE, viewerRole: 'leader' as const }, BASE]) {
    cleanup();
    fetchGroup.mockResolvedValue({ group });
    renderPage();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: 'Leave group' })).toBeNull();
  }
});

test('Leave group asks first; Cancel and Escape back out without leaving', async () => {
  fetchGroup.mockResolvedValue({ group: AS_MEMBER });
  const user = renderPage();
  await user.click(await screen.findByRole('button', { name: 'Leave group' }));
  const question = screen.getByRole('group', { name: 'Leave this group?' });
  expect(question.textContent).toContain('Your seat goes to someone else.');
  expect(document.activeElement).toBe(within(question).getByRole('button', { name: 'Cancel' }));
  expect(within(question).getByRole('button', { name: 'Leave group' }).className).toContain('cm-btn--danger');

  await user.click(within(question).getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('group', { name: 'Leave this group?' })).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Leave group' }));

  await user.click(screen.getByRole('button', { name: 'Leave group' }));
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('group', { name: 'Leave this group?' })).toBeNull();
  expect(leaveGroup).not.toHaveBeenCalled();
});

test('a member who confirms leaves, and then sees the group as someone outside it', async () => {
  fetchGroup.mockResolvedValueOnce({ group: AS_MEMBER }).mockResolvedValue({ group: BASE });
  leaveGroup.mockResolvedValue(null);
  const user = renderPage();
  await user.click(await screen.findByRole('button', { name: 'Leave group' }));
  const question = screen.getByRole('group', { name: 'Leave this group?' });
  await user.click(within(question).getByRole('button', { name: 'Leave group' }));
  expect(leaveGroup).toHaveBeenCalledWith('g1');
  const notice = await screen.findByRole('status');
  expect(notice.textContent).toBe('You left this group.');
  expect(document.activeElement).toBe(notice);
  expect(screen.getByRole('button', { name: 'Request to join' })).toBeTruthy();
  expect(screen.queryByText('(you)')).toBeNull();
});

test('if leaving fails, the question stays open with the reason', async () => {
  fetchGroup.mockResolvedValue({ group: AS_MEMBER });
  leaveGroup.mockRejectedValue(new ApiError(409, 'leader_cannot_leave', 'You lead this group, so you cannot leave it.'));
  const user = renderPage();
  await user.click(await screen.findByRole('button', { name: 'Leave group' }));
  const question = screen.getByRole('group', { name: 'Leave this group?' });
  await user.click(within(question).getByRole('button', { name: 'Leave group' }));
  expect((await within(question).findByRole('alert')).textContent).toBe('You lead this group, so you cannot leave it.');
  expect(within(question).getByRole('button', { name: 'Cancel' })).toBeTruthy();
});

test('the leader can approve a request, and the list refreshes', async () => {
  fetchGroup
    .mockResolvedValueOnce({
      group: { ...BASE, viewerRole: 'leader', pendingRequests: [{ id: 'r1', userId: 'u5', name: 'Pat Doe', profile: null }] },
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

test('answering a request updates the waiting count on My groups in the navigation', async () => {
  fetchGroup.mockResolvedValue({
    group: { ...BASE, viewerRole: 'leader', pendingRequests: [{ id: 'r1', userId: 'u5', name: 'Pat Doe', profile: null }] },
  });
  fetchPendingRequestCount.mockResolvedValueOnce({ pendingRequestCount: 2 }).mockResolvedValue({ pendingRequestCount: 1 });
  decideJoinRequest.mockResolvedValue({ group: BASE });
  render(
    <MemoryRouter initialEntries={['/groups/c1/g1']}>
      <PendingRequestsProvider>
        <Routes>
          <Route path="/groups/:courseId/:groupId" element={<GroupDetailsPage />} />
        </Routes>
      </PendingRequestsProvider>
    </MemoryRouter>,
  );
  const user = userEvent.setup();
  expect(await screen.findByRole('link', { name: /My groups.*2 requests waiting/ })).toBeTruthy();
  await user.click(await screen.findByRole('button', { name: 'Decline Pat Doe' }));
  expect(await screen.findByRole('link', { name: /My groups.*1 request waiting/ })).toBeTruthy();
});

test('the leader can decline a request', async () => {
  fetchGroup.mockResolvedValue({
    group: { ...BASE, viewerRole: 'leader', pendingRequests: [{ id: 'r1', userId: 'u5', name: 'Pat Doe', profile: null }] },
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

test('a group opened under another course\'s address is not found there', async () => {
  fetchGroup.mockResolvedValue({ group: BASE });
  renderPage(undefined, '/groups/c2/g1');
  expect(await screen.findByRole('heading', { name: 'Group not found' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Review SOLID' })).toBeNull();
});

// A failed action usually means the group changed under the student (it
// filled up, or the leader answered first), so the page shows it as it is now.
test('when joining fails because the group filled up, the page shows it full', async () => {
  fetchGroup.mockResolvedValueOnce({ group: BASE }).mockResolvedValue({ group: { ...BASE, memberCount: 6 } });
  requestToJoin.mockRejectedValue(new ApiError(409, 'group_full', 'This group is full.'));
  const user = renderPage();
  await user.click(await screen.findByRole('button', { name: 'Request to join' }));
  expect(await screen.findByRole('heading', { name: 'This group is full' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Request to join' })).toBeNull();
});

test('when withdrawing fails because the leader already approved, the page shows the membership', async () => {
  fetchGroup
    .mockResolvedValueOnce({ group: { ...BASE, viewerRequestStatus: 'pending' } })
    .mockResolvedValue({ group: AS_MEMBER });
  withdrawJoinRequest.mockRejectedValue(
    new ApiError(404, 'request_not_found', 'You have no pending request for this group.'),
  );
  const user = renderPage();
  await user.click(await screen.findByRole('button', { name: 'Withdraw request' }));
  expect(await screen.findByRole('heading', { name: 'You are in this group' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Request sent' })).toBeNull();
});

test('when an answer fails because the request was withdrawn, the list drops it', async () => {
  const LEADING = { ...BASE, viewerRole: 'leader' as const };
  fetchGroup
    .mockResolvedValueOnce({ group: { ...LEADING, pendingRequests: [{ id: 'r1', userId: 'u5', name: 'Pat Doe', profile: null }] } })
    .mockResolvedValue({ group: LEADING });
  decideJoinRequest.mockRejectedValue(
    new ApiError(404, 'request_not_found', 'That request does not exist or was already answered.'),
  );
  const user = renderPage();
  await user.click(await screen.findByRole('button', { name: 'Approve Pat Doe' }));
  expect(await screen.findByText('No one is waiting to join.')).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toBe('That request does not exist or was already answered.');
});

test('only the leader is offered Delete group', async () => {
  fetchGroup.mockResolvedValue({ group: { ...BASE, viewerRole: 'leader' } });
  renderPage();
  expect(await screen.findByRole('button', { name: 'Delete group' })).toBeTruthy();
  for (const group of [AS_MEMBER, BASE]) {
    cleanup();
    fetchGroup.mockResolvedValue({ group });
    renderPage();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: 'Delete group' })).toBeNull();
  }
});

test('the leader who confirms Delete group lands on the course\'s groups', async () => {
  fetchGroup.mockResolvedValue({ group: { ...BASE, viewerRole: 'leader' } });
  deleteGroup.mockResolvedValue(null);
  const user = renderPage();
  await user.click(await screen.findByRole('button', { name: 'Delete group' }));
  const question = screen.getByRole('group', { name: 'Delete this group?' });
  expect(question.textContent).toContain('members');
  await user.click(within(question).getByRole('button', { name: 'Delete group' }));
  expect(deleteGroup).toHaveBeenCalledWith('g1');
  expect(await screen.findByRole('heading', { name: 'Groups page' })).toBeTruthy();
});

// ---- Group chat ------------------------------------------------------------

const CHAT_LINK = 'https://groupme.com/join_group/12345678/AbCdEf';

test('a member gets Open group chat as the main action, opening in a new tab', async () => {
  fetchGroup.mockResolvedValue({ group: { ...AS_MEMBER, chatLink: CHAT_LINK, hasChatLink: true } });
  renderPage();
  const chat = await screen.findByRole('link', { name: /Open group chat/ });
  expect(chat.getAttribute('href')).toBe(CHAT_LINK);
  expect(chat.getAttribute('target')).toBe('_blank');
  expect(chat.getAttribute('rel')).toContain('noopener');
  expect(chat.className).toContain('cm-btn--primary');
  expect(within(actionPanel()).getByText(/Opens the group’s GroupMe in a new tab\. Only members see this link\./)).toBeTruthy();
  expect(screen.getByText('Group chat · GroupMe')).toBeTruthy();
  expect(screen.getByText('Added by Alex Rivera')).toBeTruthy();
});

test('in an online group with a chat, the chat is the one primary action and Join meeting steps back', async () => {
  fetchGroup.mockResolvedValue({
    group: {
      ...AS_MEMBER,
      format: 'online',
      location: 'https://zoom.us/j/1234567890',
      chatLink: 'https://discord.gg/abc123',
      hasChatLink: true,
    },
  });
  renderPage();
  const chat = await screen.findByRole('link', { name: /Open group chat/ });
  expect(chat.className).toContain('cm-btn--primary');
  expect(screen.getByRole('link', { name: /Join meeting/ }).className).toContain('cm-btn--secondary');
  expect(actionPanel().querySelectorAll('.cm-btn--primary')).toHaveLength(1);
});

for (const [who, group] of [
  ['a student outside the group', { ...BASE, chatLink: null, hasChatLink: true }],
  ['a student whose request is pending', { ...BASE, viewerRequestStatus: 'pending', chatLink: null, hasChatLink: true }],
] as const) {
  test(`${who} learns a chat exists, with no link to it`, async () => {
    fetchGroup.mockResolvedValue({ group });
    renderPage();
    expect(await screen.findByText('The link is shared with members.')).toBeTruthy();
    expect(screen.getByText('Group chat')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Open group chat/ })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Add a group chat link' })).toBeNull();
  });
}

test('a group without a chat shows no chat line to members', async () => {
  fetchGroup.mockResolvedValue({ group: AS_MEMBER });
  renderPage();
  await screen.findByRole('heading', { level: 1 });
  expect(screen.queryByText(/Group chat/)).toBeNull();
  expect(screen.queryByRole('link', { name: 'Add a group chat link' })).toBeNull();
});

test('a leader whose group has no chat is offered Add a group chat link, which opens Edit group', async () => {
  fetchGroup.mockResolvedValue({ group: { ...BASE, viewerRole: 'leader' } });
  const user = renderPage();
  expect(await screen.findByText('No group chat yet')).toBeTruthy();
  await user.click(screen.getByRole('link', { name: 'Add a group chat link' }));
  expect(screen.getByRole('heading', { name: 'Edit page' })).toBeTruthy();
});

test('a leader whose group has a chat sees it as theirs, not a prompt to add one', async () => {
  fetchGroup.mockResolvedValue({
    group: { ...BASE, viewerRole: 'leader', chatLink: 'https://chat.whatsapp.com/GxQ5Rk1aBcD', hasChatLink: true },
  });
  renderPage();
  expect(await screen.findByText('Group chat · WhatsApp')).toBeTruthy();
  expect(screen.getByText('Added by you')).toBeTruthy();
  expect(screen.getByRole('link', { name: /Open group chat/ })).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Add a group chat link' })).toBeNull();
});
