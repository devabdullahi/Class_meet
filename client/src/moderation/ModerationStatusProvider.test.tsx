/**
 * The Reports item in the navigation, as the server's answer decides it.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { api, ApiError } from '../api';
import { ClassMeetLayout } from '../components/ClassMeetLayout';
import { ModerationStatusProvider } from './ModerationStatusProvider';

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Sara Ahmed', email: 'sara@mavs.uta.edu' }, signOut: vi.fn() }),
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, api: { ...actual.api, fetchModerationStatus: vi.fn() } };
});
const fetchModerationStatus = vi.mocked(api.fetchModerationStatus);

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderLayout(path = '/') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <ModerationStatusProvider>
        <ClassMeetLayout>
          <p>Page</p>
        </ClassMeetLayout>
      </ModerationStatusProvider>
    </MemoryRouter>,
  );
}

test('a moderator sees Reports with the number of open reports', async () => {
  fetchModerationStatus.mockResolvedValue({ isModerator: true, openCount: 3 });
  renderLayout('/reports');
  const link = await screen.findByRole('link', { name: 'Reports, 3 open' });
  expect(link.getAttribute('href')).toBe('/reports');
  expect(link.getAttribute('aria-current')).toBe('page');
});

test('with nothing open, a moderator sees Reports without a count', async () => {
  fetchModerationStatus.mockResolvedValue({ isModerator: true, openCount: 0 });
  renderLayout();
  expect(await screen.findByRole('link', { name: 'Reports' })).toBeTruthy();
});

test('a student who is not a moderator never sees Reports', async () => {
  fetchModerationStatus.mockResolvedValue({ isModerator: false, openCount: null });
  renderLayout();
  await vi.waitFor(() => expect(fetchModerationStatus).toHaveBeenCalled());
  expect(screen.queryByRole('link', { name: /Reports/ })).toBeNull();
});

test('when the server cannot say, Reports stays hidden', async () => {
  fetchModerationStatus.mockRejectedValue(new ApiError(503, 'database_unavailable', 'Down.'));
  renderLayout();
  await vi.waitFor(() => expect(fetchModerationStatus).toHaveBeenCalled());
  expect(screen.queryByRole('link', { name: /Reports/ })).toBeNull();
});
