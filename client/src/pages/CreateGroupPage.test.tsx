import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, ApiError, type GroupDetails } from '../api';
import { CreateGroupPage } from './CreateGroupPage';

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Dev Student', email: 'dev@mavs.uta.edu' }, signOut: vi.fn() }),
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: { ...actual.api, fetchMyCourses: vi.fn(), createGroup: vi.fn(), searchCourses: vi.fn(), enrollInCourse: vi.fn() },
  };
});

const fetchMyCourses = vi.mocked(api.fetchMyCourses);
const createGroup = vi.mocked(api.createGroup);

const COURSE = {
  id: 'c1',
  code: 'CSE 3311',
  title: 'Object Oriented Software Engineering',
  groupCount: 0,
  openGroupCount: 0,
  joinedGroupCount: 0,
  classmateCount: 0,
};
const CREATED = { id: 'g1', courseId: 'c1' } as GroupDetails;

beforeEach(() => {
  fetchMyCourses.mockResolvedValue({ courses: [COURSE] });
  createGroup.mockResolvedValue({ group: CREATED });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function GroupPageStub() {
  const state = useLocation().state as { created?: boolean } | null;
  return <h1>Group page {state?.created === true ? '(created)' : ''}</h1>;
}

function renderPage(entry = '/groups/create') {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/groups/create" element={<CreateGroupPage />} />
        <Route path="/groups/:courseId/:groupId" element={<GroupPageStub />} />
        <Route path="/groups/:courseId" element={<h1>Course groups page</h1>} />
        <Route path="/" element={<h1>Dashboard</h1>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

const submit = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Create group' }));

async function fillDetails(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('option', { name: /CSE 3311/ });
  await user.selectOptions(screen.getByLabelText('Course'), 'c1');
  await user.type(screen.getByLabelText('Group name'), 'Exam crew');
  await user.type(screen.getByLabelText('What will you study?'), 'Review for the exam');
  await user.selectOptions(screen.getByLabelText('Day'), 'Tuesday');
  // Native time-picker UI is browser-owned; supply its normalized value in jsdom.
  fireEvent.change(screen.getByLabelText('Time'), { target: { value: '14:30' } });
  await user.type(screen.getByLabelText('Meeting place'), 'Central Library');
}

/** The error message the field's aria-describedby points at. */
function messageFor(label: string): string | null {
  const id = screen.getByLabelText(label).getAttribute('aria-describedby');
  return id === null ? null : (document.getElementById(id)?.textContent ?? null);
}

test('lists the student\'s own courses to choose from', async () => {
  renderPage();
  expect(await screen.findByRole('option', { name: /CSE 3311/ })).toBeTruthy();
  expect(screen.getByRole('heading', { level: 1, name: 'Create a study group' })).toBeTruthy();
});

test('opened from a course page, the course is fixed and Back and Cancel return to it', async () => {
  const user = renderPage('/groups/create?course=c1');
  await screen.findByText('Object Oriented Software Engineering');
  expect(screen.queryByRole('combobox', { name: 'Course' })).toBeNull();
  await user.click(screen.getByRole('link', { name: /Back to CSE 3311/ }));
  expect(screen.getByRole('heading', { name: 'Course groups page' })).toBeTruthy();
});

test('with no courses yet, it offers to add one instead of an unusable form', async () => {
  fetchMyCourses.mockResolvedValue({ courses: [] });
  const user = renderPage();
  expect(await screen.findByRole('heading', { name: 'Add a course first' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Create group' })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Add a course' }));
  expect(screen.getByRole('dialog', { name: 'Add a course' })).toBeTruthy();
});

test('an empty form shows an error beside every missing field and focuses the first', async () => {
  const user = renderPage();
  await screen.findByRole('option', { name: /CSE 3311/ });
  await submit(user);
  expect(messageFor('Course')).toBe('Choose a course.');
  expect(messageFor('Group name')).toBe('Give the group a name.');
  expect(messageFor('What will you study?')).toBe('Say what the group will study.');
  expect(messageFor('Day')).toBe('Choose a day.');
  expect(messageFor('Time')).toBe('Choose a time.');
  expect(messageFor('Meeting place')).toBe('Say where the group will meet.');
  expect(screen.getByLabelText('Course').getAttribute('aria-invalid')).toBe('true');
  expect(document.activeElement).toBe(screen.getByLabelText('Course'));
  expect(createGroup).not.toHaveBeenCalled();
});

test('fixing a field clears its error', async () => {
  const user = renderPage();
  await screen.findByRole('option', { name: /CSE 3311/ });
  await submit(user);
  await user.selectOptions(screen.getByLabelText('Day'), 'Friday');
  expect(screen.getByLabelText('Day').getAttribute('aria-invalid')).toBe('false');
  expect(messageFor('Day')).toBeNull();
});

test.each(['0', '1', '51', '2.5', ''])('rejects group size %j', async (size) => {
  const user = renderPage();
  await fillDetails(user);
  await user.clear(screen.getByLabelText('Group size'));
  if (size) await user.type(screen.getByLabelText('Group size'), size);
  await submit(user);
  expect(messageFor('Group size')).toBe('Enter a whole number from 2 to 50.');
  expect(document.activeElement).toBe(screen.getByLabelText('Group size'));
  expect(createGroup).not.toHaveBeenCalled();
});

test('the size buttons step within 2 to 50', async () => {
  const user = renderPage();
  await screen.findByRole('option', { name: /CSE 3311/ });
  const size = screen.getByLabelText('Group size') as HTMLInputElement;
  expect(size.value).toBe('4');
  await user.click(screen.getByRole('button', { name: 'More people' }));
  expect(size.value).toBe('5');
  for (let i = 0; i < 5; i += 1) await user.click(screen.getByRole('button', { name: 'Fewer people' }));
  expect(size.value).toBe('2');
});

test('the group name comes first after the course and counts its characters', async () => {
  const user = renderPage();
  await screen.findByRole('option', { name: /CSE 3311/ });
  const labels = [...document.querySelectorAll('.cm-create-form .cm-label')].map((label) => label.textContent);
  expect(labels.slice(0, 3)).toEqual(['Course', 'Group name', 'What will you study?']);
  expect(messageFor('Group name')).toBe('0/80 characters');
  await user.type(screen.getByLabelText('Group name'), 'Crew');
  expect(messageFor('Group name')).toBe('4/80 characters');
  expect(screen.getByLabelText('Group name').getAttribute('maxlength')).toBe('80');
});

test.each(['Group name', 'What will you study?', 'Meeting place'])('rejects whitespace-only %s', async (label) => {
  const user = renderPage();
  await fillDetails(user);
  await user.clear(screen.getByLabelText(label));
  await user.type(screen.getByLabelText(label), '   ');
  await submit(user);
  expect(screen.getByLabelText(label).getAttribute('aria-invalid')).toBe('true');
  expect(createGroup).not.toHaveBeenCalled();
});

test('online format asks for a link and clears the location in both directions', async () => {
  const user = renderPage();
  await screen.findByRole('option', { name: /CSE 3311/ });
  await user.type(screen.getByLabelText('Meeting place'), 'Library');
  await user.click(screen.getByRole('radio', { name: 'Online' }));
  const link = screen.getByLabelText('Meeting link') as HTMLInputElement;
  expect(link.value).toBe('');
  expect(screen.queryByLabelText('Meeting place')).toBeNull();
  expect(messageFor('Meeting link')).toMatch(/Create a meeting in Teams, Zoom or Google Meet/);
  await user.type(link, 'https://example.com/meeting');
  await user.click(screen.getByRole('radio', { name: 'In person' }));
  expect((screen.getByLabelText('Meeting place') as HTMLInputElement).value).toBe('');
});

test.each([
  ['', 'Paste the meeting link.'],
  ['not-a-link', 'Paste the full link, starting with https://'],
])('blocks an online group with link %j', async (value, message) => {
  const user = renderPage();
  await fillDetails(user);
  await user.click(screen.getByRole('radio', { name: 'Online' }));
  if (value) await user.type(screen.getByLabelText('Meeting link'), value);
  await submit(user);
  expect(messageFor('Meeting link')).toBe(message);
  expect(createGroup).not.toHaveBeenCalled();
});

test('an in-person group is sent to the API and the student lands on the new group', async () => {
  const user = renderPage();
  await fillDetails(user);
  await submit(user);
  expect(createGroup).toHaveBeenCalledWith({
    courseId: 'c1',
    name: 'Exam crew',
    goal: 'Review for the exam',
    meetingDay: 'Tuesday',
    meetingTime: '14:30',
    format: 'in_person',
    location: 'Central Library',
    maxMembers: 4,
  });
  expect(await screen.findByRole('heading', { name: 'Group page (created)' })).toBeTruthy();
});

test('an online group is sent with its meeting link', async () => {
  const user = renderPage();
  await fillDetails(user);
  await user.click(screen.getByRole('radio', { name: 'Online' }));
  await user.type(screen.getByLabelText('Meeting link'), 'https://example.com/meeting');
  await submit(user);
  expect(createGroup).toHaveBeenCalledWith(
    expect.objectContaining({ format: 'online', location: 'https://example.com/meeting' }),
  );
});

test('shows the server message when the group cannot be created and keeps the form', async () => {
  createGroup.mockRejectedValue(new ApiError(404, 'course_not_found', 'That course does not exist.'));
  const user = renderPage();
  await fillDetails(user);
  await submit(user);
  expect((await screen.findByRole('alert')).textContent).toBe('That course does not exist.');
  expect((screen.getByLabelText('What will you study?') as HTMLTextAreaElement).value).toBe('Review for the exam');
  await user.type(screen.getByLabelText('What will you study?'), ' together');
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
});

test.each([/Back to my courses/, /^Cancel$/])('%s returns to My Courses', async (name) => {
  const user = renderPage();
  await screen.findByRole('option', { name: /CSE 3311/ });
  await user.click(screen.getByRole('link', { name }));
  expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy();
});
