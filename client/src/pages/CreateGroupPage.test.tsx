import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, ApiError, type GroupDetails } from '../api';
import { CreateGroupPage } from './CreateGroupPage';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, api: { ...actual.api, fetchMyCourses: vi.fn(), createGroup: vi.fn() } };
});

const fetchMyCourses = vi.mocked(api.fetchMyCourses);
const createGroup = vi.mocked(api.createGroup);

const COURSE = { id: 'c1', code: 'CSE 3311', title: 'Object Oriented Software Engineering', groupCount: 0 };
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
        <Route path="/" element={<h1>Dashboard</h1>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

async function fillDetails(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('option', { name: /CSE 3311/ });
  await user.selectOptions(screen.getByLabelText('Course'), 'c1');
  await user.selectOptions(screen.getByLabelText('Meeting day'), 'Tuesday');
  // Native time-picker UI is browser-owned; supply its normalized value in jsdom.
  fireEvent.change(screen.getByLabelText('Meeting time (local time)'), {
    target: { value: '14:30' },
  });
  await user.type(screen.getByLabelText('Maximum members'), '4');
  await user.type(screen.getByLabelText('Study goal'), 'Review for the exam');
  await user.type(screen.getByLabelText('Meeting location'), 'Central Library');
}

test('lists the student\'s own courses to choose from', async () => {
  renderPage();
  expect(await screen.findByRole('option', { name: /CSE 3311/ })).toBeTruthy();
  expect((screen.getByLabelText('Course') as HTMLSelectElement).disabled).toBe(false);
});

test('preselects the course when opened from a course page', async () => {
  renderPage('/groups/create?course=c1');
  await screen.findByRole('option', { name: /CSE 3311/ });
  expect((screen.getByLabelText('Course') as HTMLSelectElement).value).toBe('c1');
});

test('explains what to do when the student has no courses yet', async () => {
  fetchMyCourses.mockResolvedValue({ courses: [] });
  renderPage();
  expect(await screen.findByText(/You have no courses yet/)).toBeTruthy();
  expect((screen.getByLabelText('Course') as HTMLSelectElement).disabled).toBe(true);
});

test.each([
  'Course', 'Meeting day', 'Meeting time (local time)', 'Maximum members',
  'Study goal', 'Meeting location',
])('requires %s before submitting', async (label) => {
  const user = renderPage();
  await fillDetails(user);
  const field = screen.getByLabelText(label) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  fireEvent.change(field, { target: { value: '' } });
  await user.click(screen.getByRole('button', { name: 'Create Group' }));
  expect(field.validity.valueMissing).toBe(true);
  expect(createGroup).not.toHaveBeenCalled();
});

test.each(['0', '1', '-1', '2.5'])('rejects invalid member count %s', async (count) => {
  const user = renderPage();
  await fillDetails(user);
  const field = screen.getByLabelText('Maximum members') as HTMLInputElement;
  await user.clear(field);
  await user.type(field, count);
  await user.click(screen.getByRole('button', { name: 'Create Group' }));
  expect(field.checkValidity()).toBe(false);
  expect(createGroup).not.toHaveBeenCalled();
});

test.each(['Study goal', 'Meeting location'])('rejects whitespace-only %s', async (label) => {
  const user = renderPage();
  await fillDetails(user);
  await user.clear(screen.getByLabelText(label));
  await user.type(screen.getByLabelText(label), '   ');
  await user.click(screen.getByRole('button', { name: 'Create Group' }));
  expect(screen.getByRole('alert').textContent).toBe('Enter a study goal and meeting location.');
  expect(createGroup).not.toHaveBeenCalled();
});

test('online format shows link guidance and clears location in both directions', async () => {
  const user = renderPage();
  await user.type(screen.getByLabelText('Meeting location'), 'Library');
  await user.selectOptions(screen.getByLabelText('Meeting format'), 'online');
  const link = screen.getByLabelText('Meeting link') as HTMLInputElement;
  expect(link.value).toBe('');
  expect(screen.queryByLabelText('Meeting location')).toBeNull();
  const help = screen.getByText(/Create a meeting in Teams, Zoom, or Google Meet/);
  expect(link.getAttribute('aria-describedby')).toBe(help.id);
  await user.type(link, 'https://example.com/meeting');
  await user.selectOptions(screen.getByLabelText('Meeting format'), 'in-person');
  expect((screen.getByLabelText('Meeting location') as HTMLInputElement).value).toBe('');
  expect(screen.queryByText(/Create a meeting in Teams/)).toBeNull();
});

test.each(['', 'not-a-link'])('blocks submission with invalid online link %j', async (value) => {
  const user = renderPage();
  await fillDetails(user);
  await user.selectOptions(screen.getByLabelText('Meeting format'), 'online');
  const link = screen.getByLabelText('Meeting link') as HTMLInputElement;
  if (value) await user.type(link, value);
  await user.click(screen.getByRole('button', { name: 'Create Group' }));
  expect(link.checkValidity()).toBe(false);
  expect(createGroup).not.toHaveBeenCalled();
});

test('an in-person group is sent to the API and the student lands on the new group', async () => {
  const user = renderPage();
  await fillDetails(user);
  await user.click(screen.getByRole('button', { name: 'Create Group' }));
  expect(createGroup).toHaveBeenCalledWith({
    courseId: 'c1',
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
  await user.selectOptions(screen.getByLabelText('Meeting format'), 'online');
  await user.type(screen.getByLabelText('Meeting link'), 'https://example.com/meeting');
  await user.click(screen.getByRole('button', { name: 'Create Group' }));
  expect(createGroup).toHaveBeenCalledWith(
    expect.objectContaining({ format: 'online', location: 'https://example.com/meeting' }),
  );
});

test('shows the server message when the group cannot be created and keeps the form', async () => {
  createGroup.mockRejectedValue(new ApiError(404, 'course_not_found', 'That course does not exist.'));
  const user = renderPage();
  await fillDetails(user);
  await user.click(screen.getByRole('button', { name: 'Create Group' }));
  expect((await screen.findByRole('alert')).textContent).toBe('That course does not exist.');
  expect((screen.getByLabelText('Study goal') as HTMLTextAreaElement).value).toBe('Review for the exam');
  await user.type(screen.getByLabelText('Study goal'), ' together');
  expect(screen.queryByRole('alert')).toBeNull();
});

test.each([/Back/, /^Cancel$/])('%s navigates to the dashboard', async (name) => {
  const user = renderPage();
  await user.click(screen.getByRole('link', { name }));
  expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy();
});
