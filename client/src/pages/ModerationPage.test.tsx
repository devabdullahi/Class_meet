import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, ApiError, type ModerationReports, type OpenReportTarget } from '../api';
import { ModerationPage } from './ModerationPage';

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'mod1', name: 'Sara Ahmed', email: 'sara@mavs.uta.edu' }, signOut: vi.fn() }),
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      fetchModerationReports: vi.fn(),
      keepReported: vi.fn(),
      removeReportedGroup: vi.fn(),
      removeReportedMember: vi.fn(),
    },
  };
});

const fetchModerationReports = vi.mocked(api.fetchModerationReports);
const keepReported = vi.mocked(api.keepReported);
const removeReportedGroup = vi.mocked(api.removeReportedGroup);
const removeReportedMember = vi.mocked(api.removeReportedMember);

const GROUP_TARGET: OpenReportTarget = {
  groupId: 'g1',
  groupTitle: 'Midterm 2 answer key',
  courseId: 'c1',
  courseCode: 'CSE 3311',
  leaderName: 'Kevin Tran',
  memberCount: 3,
  member: null,
  reportCount: 4,
  latestReport: {
    reason: 'exam_answers',
    details: 'The goal offers last semester’s Midterm 2 for $20.',
    reporterName: 'Maya Okafor',
    reportedAt: '2026-11-15T18:00:00.000Z',
  },
};

const MEMBER_TARGET: OpenReportTarget = {
  ...GROUP_TARGET,
  groupId: 'g2',
  groupTitle: 'Project 3 pair debugging',
  member: { userId: 'u5', name: 'Tyler Brooks', isLeader: false, inGroup: true },
  reportCount: 1,
  latestReport: {
    reason: 'harassment',
    details: null,
    reporterName: 'Luis Hernandez',
    reportedAt: '2026-11-16T18:00:00.000Z',
  },
};

const REPORTS: ModerationReports = {
  open: [GROUP_TARGET, MEMBER_TARGET],
  resolved: [
    {
      groupId: 'g3',
      groupTitle: 'Quiz prep',
      courseCode: 'CSE 3311',
      memberName: null,
      reportCount: 1,
      reason: 'not_study_group',
      outcome: 'kept',
      resolvedAt: '2026-11-13T18:00:00.000Z',
      resolvedById: 'mod2',
      resolvedByName: 'Sam Lee',
    },
    {
      groupId: 'g4',
      groupTitle: 'Saturday exam cram',
      courseCode: 'CSE 3311',
      memberName: 'Jake Morris',
      reportCount: 2,
      reason: 'harassment',
      outcome: 'removed_from_group',
      resolvedAt: '2026-11-10T18:00:00.000Z',
      resolvedById: 'mod1',
      resolvedByName: 'Sara Ahmed',
    },
  ],
  resolvedCount: 2,
};

beforeEach(() => {
  fetchModerationReports.mockResolvedValue(REPORTS);
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderPage() {
  render(
    <MemoryRouter>
      <ModerationPage />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

const rowFor = (name: string) => screen.getByRole('article', { name });

test('lists each reported group or member in the order the server ranks them', async () => {
  renderPage();
  const rows = await screen.findAllByRole('article');
  expect(rows.map((row) => within(row).getByRole('heading').textContent)).toEqual([
    'Midterm 2 answer key',
    'Tyler Brooks',
  ]);
  const groupRow = rowFor('Midterm 2 answer key');
  expect(within(groupRow).getByText('4')).toBeTruthy();
  expect(within(groupRow).getByText('Group in CSE 3311 · Leader: Kevin Tran · 3 members')).toBeTruthy();
  expect(within(groupRow).getByText('Selling or sharing exam answers')).toBeTruthy();
  expect(within(groupRow).getByText('“The goal offers last semester’s Midterm 2 for $20.” Maya Okafor, Nov 15')).toBeTruthy();
  expect(within(groupRow).getByRole('link', { name: 'View the group Midterm 2 answer key' }).getAttribute('href')).toBe(
    '/groups/c1/g1',
  );

  const memberRow = rowFor('Tyler Brooks');
  expect(within(memberRow).getByText('Member of Project 3 pair debugging · CSE 3311')).toBeTruthy();
  expect(within(memberRow).getByText('Reported by Luis Hernandez, Nov 16')).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Open · 2' })).toHaveProperty('checked', true);
});

test('Resolve keeps the group, says so, and loads the queue again', async () => {
  keepReported.mockResolvedValue(null);
  const user = renderPage();
  await screen.findAllByRole('article');
  fetchModerationReports.mockResolvedValue({ ...REPORTS, open: [MEMBER_TARGET] });

  await user.click(screen.getByRole('button', { name: 'Resolve the reports about Midterm 2 answer key' }));

  expect(keepReported).toHaveBeenCalledWith('g1', null);
  const notice = await screen.findByText('Resolved the reports about “Midterm 2 answer key”. Nothing was changed.');
  expect(document.activeElement).toBe(notice.closest('.cm-notice'));
  expect(screen.queryByRole('article', { name: 'Midterm 2 answer key' })).toBeNull();
});

test('Remove group asks first, stating what happens, then takes the group down', async () => {
  removeReportedGroup.mockResolvedValue(null);
  const user = renderPage();
  await screen.findAllByRole('article');

  await user.click(screen.getByRole('button', { name: 'Remove the group Midterm 2 answer key' }));
  const question = screen.getByRole('group', { name: 'Remove “Midterm 2 answer key”?' });
  expect(
    within(question).getByText(
      'It disappears from CSE 3311 for everyone and its 3 members lose access. Anyone who opens its link is told a moderator removed it. This can’t be undone.',
    ),
  ).toBeTruthy();
  expect(removeReportedGroup).not.toHaveBeenCalled();

  await user.click(within(question).getByRole('button', { name: 'Remove group' }));
  expect(removeReportedGroup).toHaveBeenCalledWith('g1');
  expect(
    await screen.findByText('Removed “Midterm 2 answer key”. Anyone who opens its link is told a moderator removed it.'),
  ).toBeTruthy();
});

test('a reported member is removed from the group, not the group itself', async () => {
  removeReportedMember.mockResolvedValue(null);
  const user = renderPage();
  await screen.findAllByRole('article');

  await user.click(screen.getByRole('button', { name: 'Remove Tyler Brooks from Project 3 pair debugging' }));
  const question = screen.getByRole('group', { name: 'Remove Tyler Brooks from “Project 3 pair debugging”?' });
  await user.click(within(question).getByRole('button', { name: 'Remove from group' }));
  expect(removeReportedMember).toHaveBeenCalledWith('g2', 'u5');
  expect(removeReportedGroup).not.toHaveBeenCalled();
});

test('a reported leader can only be acted on by removing their group', async () => {
  fetchModerationReports.mockResolvedValue({
    ...REPORTS,
    open: [{ ...MEMBER_TARGET, member: { ...MEMBER_TARGET.member!, isLeader: true } }],
  });
  renderPage();
  const row = await screen.findByRole('article', { name: 'Tyler Brooks' });
  expect(within(row).getByText('Leader of Project 3 pair debugging · CSE 3311')).toBeTruthy();
  expect(within(row).getByRole('button', { name: 'Remove the group Project 3 pair debugging' })).toBeTruthy();
  expect(within(row).queryByRole('button', { name: /from Project 3/ })).toBeNull();
});

test('a reported member who has left can only be resolved', async () => {
  fetchModerationReports.mockResolvedValue({
    ...REPORTS,
    open: [{ ...MEMBER_TARGET, member: { ...MEMBER_TARGET.member!, inGroup: false } }],
  });
  renderPage();
  const row = await screen.findByRole('article', { name: 'Tyler Brooks' });
  expect(within(row).getByText('No longer in Project 3 pair debugging · CSE 3311')).toBeTruthy();
  expect(within(row).queryByRole('button', { name: /^Remove/ })).toBeNull();
});

test('a failed Resolve says so in the row and leaves it in place', async () => {
  keepReported.mockRejectedValue(new ApiError(404, 'no_open_reports', 'Another moderator may have resolved them.'));
  const user = renderPage();
  await screen.findAllByRole('article');
  await user.click(screen.getByRole('button', { name: 'Resolve the reports about Tyler Brooks' }));
  const row = rowFor('Tyler Brooks');
  expect((await within(row).findByRole('alert')).textContent).toBe('Another moderator may have resolved them.');
});

test('Resolved lists each decision with its outcome, date and moderator', async () => {
  const user = renderPage();
  await screen.findAllByRole('article');
  await user.click(screen.getByRole('radio', { name: 'Resolved · 2' }));

  const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
  expect(rows.map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent))).toEqual([
    ['Quiz prepGroup in CSE 3311 · 1 report', 'Not a real study group', 'KeptLeft as it was', 'Nov 13 · Sam Lee'],
    [
      'Jake MorrisMember of Saturday exam cram · 2 reports',
      'Harassment or hateful language',
      'Removed from groupTaken out of the group',
      'Nov 10 · you',
    ],
  ]);
});

test('an empty queue says what will appear there', async () => {
  fetchModerationReports.mockResolvedValue({ open: [], resolved: [], resolvedCount: 0 });
  const user = renderPage();
  expect(await screen.findByRole('heading', { name: 'No open reports' })).toBeTruthy();
  await user.click(screen.getByRole('radio', { name: 'Resolved · 0' }));
  expect(screen.getByRole('heading', { name: 'No resolved reports yet' })).toBeTruthy();
});

test('a student the server refuses is told the page is for moderators, with a way out', async () => {
  fetchModerationReports.mockRejectedValue(new ApiError(403, 'not_moderator', 'Only moderators can review reports.'));
  renderPage();
  expect(await screen.findByRole('heading', { name: 'Reports are for moderators' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Go to My courses' }).getAttribute('href')).toBe('/');
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  expect(screen.queryByRole('radio')).toBeNull();
});

test('when the reports cannot be loaded the moderator can try again', async () => {
  fetchModerationReports
    .mockRejectedValueOnce(new ApiError(503, 'database_unavailable', 'Check DATABASE_URL.'))
    .mockResolvedValueOnce(REPORTS);
  const user = renderPage();
  expect((await screen.findByRole('alert')).textContent).toContain('We could not load the reports. Please try again.');
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findAllByRole('article')).toHaveLength(2);
});
