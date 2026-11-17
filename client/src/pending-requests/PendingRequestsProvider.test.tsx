import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { api, ApiError } from '../api';
import { PendingRequestsProvider } from './PendingRequestsProvider';
import { usePendingRequests } from './usePendingRequests';

let signedInUser: { id: string } | null = { id: 'u1' };
vi.mock('../auth/useAuth', () => ({ useAuth: () => ({ user: signedInUser }) }));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, api: { ...actual.api, fetchPendingRequestCount: vi.fn() } };
});
const fetchPendingRequestCount = vi.mocked(api.fetchPendingRequestCount);

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  signedInUser = { id: 'u1' };
});

function Badge() {
  const { pendingRequestCount, refresh } = usePendingRequests();
  const navigate = useNavigate();
  return (
    <>
      <output>{pendingRequestCount}</output>
      <button type="button" onClick={refresh}>Refresh</button>
      <button type="button" onClick={() => navigate('/my-groups')}>Navigate</button>
    </>
  );
}

function renderBadge() {
  render(
    <MemoryRouter>
      <PendingRequestsProvider>
        <Badge />
      </PendingRequestsProvider>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

test('counts again on every navigation and whenever a screen asks', async () => {
  fetchPendingRequestCount
    .mockResolvedValueOnce({ pendingRequestCount: 2 })
    .mockResolvedValueOnce({ pendingRequestCount: 3 })
    .mockResolvedValueOnce({ pendingRequestCount: 1 });
  const user = renderBadge();
  expect(await screen.findByText('2')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Navigate' }));
  expect(await screen.findByText('3')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(await screen.findByText('1')).toBeTruthy();
});

test('when the count cannot be fetched, the last one stays', async () => {
  fetchPendingRequestCount
    .mockResolvedValueOnce({ pendingRequestCount: 2 })
    .mockRejectedValueOnce(new ApiError(503, 'database_unavailable', 'Down.'));
  const user = renderBadge();
  expect(await screen.findByText('2')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(fetchPendingRequestCount).toHaveBeenCalledTimes(2);
  expect(screen.getByText('2')).toBeTruthy();
});

test('signed out, there is no count and nothing is fetched', () => {
  signedInUser = null;
  renderBadge();
  expect(screen.getByText('0')).toBeTruthy();
  expect(fetchPendingRequestCount).not.toHaveBeenCalled();
});
