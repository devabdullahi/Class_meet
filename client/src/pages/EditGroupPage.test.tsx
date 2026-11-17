import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, ApiError, type GroupDetails } from '../api';
import { EditGroupPage } from './EditGroupPage';

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u9', name: 'Alex Rivera', email: 'alex@mavs.uta.edu' }, signOut: vi.fn() }),
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, api: { ...actual.api, fetchGroup: vi.fn(), updateGroup: vi.fn() } };
});

const fetchGroup = vi.mocked(api.fetchGroup);
const updateGroup = vi.mocked(api.updateGroup);

/** Led by Alex, the viewer, with three members. */
const GROUP: GroupDetails = {
  id: 'g1',
  courseId: 'c1',
  courseCode: 'CSE 3311',
  courseTitle: 'Object Oriented Software Engineering',
  name: 'Midterm crew',
  goal: 'Review SOLID',
  meetingDay: 'Tuesday',
  meetingTime: '14:30',
  format: 'in_person',
  location: 'Library 412',
  maxMembers: 6,
  memberCount: 3,
  members: [
    { userId: 'u9', name: 'Alex Rivera', isLeader: true },
    { userId: 'u7', name: 'Jo Kim', isLeader: false },
    { userId: 'u8', name: 'Sam Lee', isLeader: false },
  ],
  viewerRole: 'leader',
  viewerRequestStatus: null,
  pendingRequests: [],
};

beforeEach(() => {
  fetchGroup.mockResolvedValue({ group: GROUP });
  updateGroup.mockResolvedValue({ group: GROUP });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function GroupPageStub() {
  const state = useLocation().state as { saved?: boolean } | null;
  return <h1>Group page {state?.saved === true ? '(saved)' : ''}</h1>;
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/groups/c1/g1/edit']}>
      <Routes>
        <Route path="/groups/:courseId/:groupId/edit" element={<EditGroupPage />} />
        <Route path="/groups/:courseId/:groupId" element={<GroupPageStub />} />
        <Route path="/groups/:courseId" element={<h1>Course groups page</h1>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

const valueOf = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value;

/** The error message the field's aria-describedby points at. */
function messageFor(label: string): string | null {
  const id = screen.getByLabelText(label).getAttribute('aria-describedby');
  return id === null ? null : (document.getElementById(id)?.textContent ?? null);
}

test('the form starts from the group as it is, with its course fixed', async () => {
  renderPage();
  expect(await screen.findByRole('heading', { level: 1, name: 'Edit group' })).toBeTruthy();
  expect(fetchGroup).toHaveBeenCalledWith('g1');
  expect(valueOf('Group name')).toBe('Midterm crew');
  expect(valueOf('What will you study?')).toBe('Review SOLID');
  expect(valueOf('Day')).toBe('Tuesday');
  expect(valueOf('Time')).toBe('14:30');
  expect(valueOf('Meeting place')).toBe('Library 412');
  expect(valueOf('Group size')).toBe('6');
  expect(screen.queryByRole('combobox', { name: 'Course' })).toBeNull();
  expect(screen.getByText('Object Oriented Software Engineering')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
});

test('saving sends every setting and returns to the group, which says the changes were saved', async () => {
  const user = renderPage();
  await screen.findByRole('heading', { level: 1, name: 'Edit group' });
  await user.clear(screen.getByLabelText('Group name'));
  await user.type(screen.getByLabelText('Group name'), 'Final exam crew');
  await user.selectOptions(screen.getByLabelText('Day'), 'Thursday');
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(updateGroup).toHaveBeenCalledWith('g1', {
    name: 'Final exam crew',
    goal: 'Review SOLID',
    meetingDay: 'Thursday',
    meetingTime: '14:30',
    format: 'in_person',
    location: 'Library 412',
    maxMembers: 6,
  });
  expect(await screen.findByRole('heading', { name: 'Group page (saved)' })).toBeTruthy();
});

test('the size cannot go below the members already in the group', async () => {
  const user = renderPage();
  await screen.findByRole('heading', { level: 1, name: 'Edit group' });
  expect(messageFor('Group size')).toBe('Including you. At least 3, the members already in it, up to 50.');
  for (let i = 0; i < 5; i += 1) await user.click(screen.getByRole('button', { name: 'Fewer people' }));
  expect(valueOf('Group size')).toBe('3');
  await user.clear(screen.getByLabelText('Group size'));
  await user.type(screen.getByLabelText('Group size'), '2');
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(messageFor('Group size')).toBe('The group has 3 members, so its size must be at least 3.');
  expect(updateGroup).not.toHaveBeenCalled();
});

test('shows the server message when the changes cannot be saved, and keeps them', async () => {
  updateGroup.mockRejectedValue(
    new ApiError(400, 'invalid_maxMembers', 'Group size cannot be less than the number of members already in the group.'),
  );
  const user = renderPage();
  await screen.findByRole('heading', { level: 1, name: 'Edit group' });
  await user.type(screen.getByLabelText('Group name'), '!');
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  expect((await screen.findByRole('alert')).textContent).toBe(
    'Group size cannot be less than the number of members already in the group.',
  );
  expect(valueOf('Group name')).toBe('Midterm crew!');
});

test('a group from before names existed must be given one when it is edited', async () => {
  fetchGroup.mockResolvedValue({ group: { ...GROUP, name: null } });
  const user = renderPage();
  await screen.findByRole('heading', { level: 1, name: 'Edit group' });
  expect(valueOf('Group name')).toBe('');
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(messageFor('Group name')).toBe('Give the group a name.');
  expect(updateGroup).not.toHaveBeenCalled();
});

test.each([/Back to the group/, /^Cancel$/])('%s returns to the group without saving', async (name) => {
  const user = renderPage();
  await screen.findByRole('heading', { level: 1, name: 'Edit group' });
  await user.click(screen.getByRole('link', { name }));
  expect(screen.getByRole('heading', { name: 'Group page' })).toBeTruthy();
  expect(updateGroup).not.toHaveBeenCalled();
});

test('a member who is not the leader is told so instead of getting the form', async () => {
  fetchGroup.mockResolvedValue({ group: { ...GROUP, viewerRole: 'member' } });
  renderPage();
  expect(await screen.findByRole('heading', { name: 'Only the leader can edit this group' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
});

test('a group that does not exist gets a way back', async () => {
  fetchGroup.mockRejectedValue(new ApiError(404, 'group_not_found', 'That group does not exist.'));
  const user = renderPage();
  expect(await screen.findByRole('heading', { name: 'Group not found' })).toBeTruthy();
  await user.click(screen.getByRole('link', { name: 'See this course’s groups' }));
  expect(screen.getByRole('heading', { name: 'Course groups page' })).toBeTruthy();
});

test('a server failure offers Try again', async () => {
  fetchGroup.mockRejectedValue(new ApiError(503, 'database_unavailable', 'Check DATABASE_URL.'));
  renderPage();
  expect((await screen.findByRole('alert')).textContent).toContain('We could not load this group.');
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
});
