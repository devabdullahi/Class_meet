import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { api } from '../api';
import { PendingRequestsProvider } from '../pending-requests/PendingRequestsProvider';
import { ClassMeetLayout } from './ClassMeetLayout';

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Dev Student', email: 'dev@mavs.uta.edu' },
    signOut: () => Promise.resolve(),
  }),
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, api: { ...actual.api, fetchPendingRequestCount: vi.fn() } };
});

const fetchPendingRequestCount = vi.mocked(api.fetchPendingRequestCount);

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <ClassMeetLayout>
        <p>content</p>
      </ClassMeetLayout>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

const current = () =>
  screen
    .getAllByRole('link')
    .filter((link) => link.getAttribute('aria-current') === 'page')
    .map((link) => link.textContent);

test.each(['/', '/groups/c1', '/groups/c1/g1'])('My Courses is the current page at %s', (path) => {
  renderAt(path);
  expect(current()).toEqual(['My courses']);
});

test('Create Group is the current page while creating a group, even from a course', () => {
  renderAt('/groups/create?course=c1');
  expect(current()).toEqual(['Create group']);
});

test('the account button says whether its menu is open, and Escape closes it', async () => {
  const user = renderAt('/');
  const toggle = screen.getByRole('button', { name: 'Account' });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  await user.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  await user.keyboard('{Escape}');
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
});

test('Your profile sits with the account details and is the current page at /profile', () => {
  renderAt('/profile');
  expect(current()).toEqual(['Your profile']);
  const link = screen.getByRole('link', { name: 'Your profile' });
  expect(link.closest('.cm-account__panel')).not.toBeNull();
  expect(link.getAttribute('href')).toBe('/profile');
});

test('My Groups is the current page at /my-groups', () => {
  renderAt('/my-groups');
  expect(current()).toEqual(['My groups']);
});

function renderWithPendingRequests(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <PendingRequestsProvider>
        <ClassMeetLayout>
          <p>content</p>
        </ClassMeetLayout>
      </PendingRequestsProvider>
    </MemoryRouter>,
  );
}

test('My Groups shows how many join requests are waiting, and says so to screen readers', async () => {
  fetchPendingRequestCount.mockResolvedValue({ pendingRequestCount: 3 });
  renderWithPendingRequests('/');
  const link = await screen.findByRole('link', { name: /My groups.*3 requests waiting/ });
  expect(link.querySelector('[aria-hidden="true"].cm-nav__count')?.textContent).toBe('3');
});

test('one waiting request is counted in the singular', async () => {
  fetchPendingRequestCount.mockResolvedValue({ pendingRequestCount: 1 });
  renderWithPendingRequests('/');
  expect(await screen.findByRole('link', { name: /My groups.*1 request waiting/ })).toBeTruthy();
});

test('with no requests waiting, My Groups has no badge', async () => {
  fetchPendingRequestCount.mockResolvedValue({ pendingRequestCount: 0 });
  renderWithPendingRequests('/');
  await waitFor(() => expect(fetchPendingRequestCount).toHaveBeenCalled());
  expect(screen.getByRole('link', { name: 'My groups' }).querySelector('.cm-nav__count')).toBeNull();
});
