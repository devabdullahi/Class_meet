/**
 * Reporting as a student sees it on Group Details: the dialog, the notice
 * that replaces the button, and the page a removed group's link leads to.
 */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, ApiError, type GroupDetails, type MyOpenReport } from '../api';
import { GroupDetailsPage } from '../pages/GroupDetailsPage';

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u8', name: 'Sam Lee', email: 'sam@mavs.uta.edu' }, signOut: vi.fn() }),
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      fetchGroup: vi.fn(),
      fetchMyReports: vi.fn(),
      reportGroup: vi.fn(),
      fetchGroupRemoval: vi.fn(),
    },
  };
});

const fetchGroup = vi.mocked(api.fetchGroup);
const fetchMyReports = vi.mocked(api.fetchMyReports);
const reportGroup = vi.mocked(api.reportGroup);
const fetchGroupRemoval = vi.mocked(api.fetchGroupRemoval);

/** Seen by Sam (u8), who is not in it. */
const GROUP: GroupDetails = {
  id: 'g1',
  courseId: 'c1',
  courseCode: 'CSE 3311',
  courseTitle: 'Object Oriented Software Engineering',
  name: 'Midterm 2 answer key',
  goal: 'Last semester’s Midterm 2 with answers. DM me for the Drive link, $20.',
  meetingDay: 'Sunday',
  meetingTime: '20:00',
  format: 'online',
  location: null,
  maxMembers: 10,
  memberCount: 2,
  members: [
    { userId: 'u9', name: 'Kevin Tran', isLeader: true },
    { userId: 'u7', name: 'Jo Kim', isLeader: false },
  ],
  viewerRole: 'none',
  viewerRequestStatus: null,
  chatLink: null,
  hasChatLink: false,
  pendingRequests: [],
};

const AS_LEADER: GroupDetails = {
  ...GROUP,
  viewerRole: 'leader',
  members: [
    { userId: 'u8', name: 'Sam Lee', isLeader: true },
    { userId: 'u7', name: 'Jo Kim', isLeader: false },
  ],
};

// Midday UTC, so the date is the same in every US time zone.
const REPORTED_AT = '2026-11-14T18:00:00.000Z';
const GROUP_REPORT: MyOpenReport = { memberId: null, memberName: null, reportedAt: REPORTED_AT };

beforeEach(() => {
  fetchGroup.mockResolvedValue({ group: GROUP });
  fetchMyReports.mockResolvedValue({ reports: [] });
  fetchGroupRemoval.mockRejectedValue(new ApiError(404, 'not_removed', 'No.'));
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/groups/c1/g1']}>
      <Routes>
        <Route path="/groups/:courseId/:groupId" element={<GroupDetailsPage />} />
        <Route path="/groups/:courseId" element={<h1>Groups page</h1>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

async function openDialog(user: ReturnType<typeof userEvent.setup>, buttonName = 'Report group or member') {
  await user.click(await screen.findByRole('button', { name: buttonName }));
  return screen.getByRole('dialog');
}

test('a student reports the group; afterwards the notice takes the place of the button', async () => {
  fetchMyReports.mockResolvedValueOnce({ reports: [] }).mockResolvedValueOnce({ reports: [GROUP_REPORT] });
  reportGroup.mockResolvedValue({ report: GROUP_REPORT });
  const user = renderPage();

  const dialog = await openDialog(user);
  expect(within(dialog).getByRole('heading', { name: 'Report this group' })).toBeTruthy();
  const options = within(dialog).getAllByRole('option').map((option) => option.textContent);
  expect(options).toEqual(['The whole group', 'Kevin Tran (leader)', 'Jo Kim']);
  const reasons = within(dialog).getAllByRole('radio');
  expect(reasons.map((reason) => (reason as HTMLInputElement).checked)).toEqual([false, false, false, false, false]);
  expect(within(dialog).getByText('Moderators see your name. The leader and members never do.')).toBeTruthy();

  await user.click(within(dialog).getByRole('radio', { name: 'Selling or sharing exam answers' }));
  await user.type(within(dialog).getByLabelText('Anything a moderator should know? (optional)'), 'Sells it for $20.');
  await user.click(within(dialog).getByRole('button', { name: 'Send report' }));

  expect(reportGroup).toHaveBeenCalledWith('g1', {
    memberId: null,
    reason: 'exam_answers',
    details: 'Sells it for $20.',
  });
  const notice = await screen.findByText(
    'You reported this group on Sat, Nov 14. A moderator is reviewing it; you don’t need to report it again.',
  );
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Report group or member' })).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(notice.closest('.cm-notice')));
});

test('the report is not sent until the student says what is wrong', async () => {
  const user = renderPage();
  const dialog = await openDialog(user);
  await user.click(within(dialog).getByRole('button', { name: 'Send report' }));
  expect(within(dialog).getByRole('alert').textContent).toBe('Choose what is wrong.');
  expect(document.activeElement).toBe(within(dialog).getByRole('radio', { name: 'Selling or sharing exam answers' }));
  expect(reportGroup).not.toHaveBeenCalled();
});

test('a student who already reported the group sees the notice and no Report button', async () => {
  fetchMyReports.mockResolvedValue({ reports: [GROUP_REPORT] });
  renderPage();
  expect(await screen.findByText(/^You reported this group on Sat, Nov 14\./)).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Report/ })).toBeNull();
});

test('reporting a member names them, and only the others are offered next time', async () => {
  const memberReport: MyOpenReport = { memberId: 'u7', memberName: 'Jo Kim', reportedAt: REPORTED_AT };
  fetchMyReports.mockResolvedValueOnce({ reports: [] }).mockResolvedValue({ reports: [memberReport] });
  reportGroup.mockResolvedValue({ report: memberReport });
  const user = renderPage();

  const dialog = await openDialog(user);
  await user.selectOptions(within(dialog).getByLabelText('Who are you reporting?'), 'Jo Kim');
  expect(within(dialog).getByRole('heading', { name: 'Report Jo Kim' })).toBeTruthy();
  await user.click(within(dialog).getByRole('radio', { name: 'Harassment or hateful language' }));
  await user.click(within(dialog).getByRole('button', { name: 'Send report' }));

  expect(reportGroup).toHaveBeenCalledWith('g1', { memberId: 'u7', reason: 'harassment', details: '' });
  expect(await screen.findByText(/^You reported Jo Kim on Sat, Nov 14\./)).toBeTruthy();
  const again = await openDialog(user);
  const options = within(again).getAllByRole('option').map((option) => option.textContent);
  expect(options).toEqual(['The whole group', 'Kevin Tran (leader)']);
});

test('a leader may report a member of their group, never the group itself or themselves', async () => {
  fetchGroup.mockResolvedValue({ group: AS_LEADER });
  const user = renderPage();
  const dialog = await openDialog(user, 'Report a member');
  const options = within(dialog).getAllByRole('option').map((option) => option.textContent);
  expect(options).toEqual(['Jo Kim']);
  expect(within(dialog).getByRole('heading', { name: 'Report Jo Kim' })).toBeTruthy();
});

test('Cancel and Escape close the dialog and return focus to the Report button', async () => {
  const user = renderPage();
  const dialog = await openDialog(user);
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  const button = screen.getByRole('button', { name: 'Report group or member' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(button);

  await user.click(button);
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(button);
});

test('a report already sent from elsewhere closes the dialog and shows the notice', async () => {
  fetchMyReports.mockResolvedValueOnce({ reports: [] }).mockResolvedValue({ reports: [GROUP_REPORT] });
  reportGroup.mockRejectedValue(new ApiError(409, 'already_reported', 'You already reported this.'));
  const user = renderPage();
  const dialog = await openDialog(user);
  await user.click(within(dialog).getByRole('radio', { name: 'Spam or advertising' }));
  await user.click(within(dialog).getByRole('button', { name: 'Send report' }));
  expect(await screen.findByText(/^You reported this group/)).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('when sending fails the dialog stays open with what went wrong', async () => {
  reportGroup.mockRejectedValue(new ApiError(503, 'database_unavailable', 'Check DATABASE_URL.'));
  const user = renderPage();
  const dialog = await openDialog(user);
  await user.click(within(dialog).getByRole('radio', { name: 'Spam or advertising' }));
  await user.click(within(dialog).getByRole('button', { name: 'Send report' }));
  expect((await within(dialog).findByRole('alert')).textContent).toBe(
    'We could not send your report. Please try again.',
  );
  expect(within(dialog).getByRole('button', { name: 'Send report' })).toBeTruthy();
});

test('the link to a group a moderator removed explains what happened', async () => {
  fetchGroup.mockRejectedValue(new ApiError(404, 'group_not_found', 'That group does not exist.'));
  fetchGroupRemoval.mockResolvedValue({
    removal: {
      groupId: 'g1',
      title: 'Midterm 2 answer key',
      courseId: 'c1',
      courseCode: 'CSE 3311',
      removedAt: '2026-11-16T18:00:00.000Z',
    },
  });
  renderPage();
  expect(await screen.findByRole('heading', { name: 'This group was removed' })).toBeTruthy();
  expect(
    screen.getByText(
      'A moderator removed “Midterm 2 answer key” on Nov 16 because it broke Class Meet’s community rules. Thanks to the students who reported it.',
    ),
  ).toBeTruthy();
  expect(screen.getByRole('link', { name: 'See other CSE 3311 groups' }).getAttribute('href')).toBe('/groups/c1');
  expect(screen.getByRole('link', { name: 'Back to CSE 3311 groups' })).toBeTruthy();
  expect(screen.queryByText('Group not found')).toBeNull();
});

test('a group that was not removed by a moderator is simply not found', async () => {
  fetchGroup.mockRejectedValue(new ApiError(404, 'group_not_found', 'That group does not exist.'));
  renderPage();
  expect(await screen.findByRole('heading', { name: 'Group not found' })).toBeTruthy();
  expect(fetchGroupRemoval).toHaveBeenCalledWith('g1');
});
