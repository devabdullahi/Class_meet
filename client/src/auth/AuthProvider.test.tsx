/**
 * MSAL is loaded only when the server offers Microsoft sign-in, so a visitor
 * who can only use an emailed code never downloads or initialises it.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './useAuth';

const createMsalInstance = vi.hoisted(() => vi.fn(async () => ({ clearCache: async () => undefined })));

vi.mock('./msal', () => ({
  createMsalInstance,
  isMsalError: () => false,
  describeMsalFailure: () => null,
}));
vi.mock('./entraClientId', () => ({ entraClientId: '11111111-2222-3333-4444-555555555555' }));

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function serveConfig(microsoftLoginEnabled: boolean): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) => {
      if (path === '/api/auth/config') {
        return reply(200, {
          emailDomains: ['mavs.uta.edu'],
          microsoftLoginEnabled,
          clientId: '11111111-2222-3333-4444-555555555555',
          apiScope: 'api://11111111-2222-3333-4444-555555555555/access_as_user',
          devLoginEnabled: false,
        });
      }
      return reply(401, { error: { code: 'not_authenticated', message: 'You are not signed in.' } });
    }),
  );
}

function StatusProbe() {
  const { status, config } = useAuth();
  return <p>{config === null ? 'no config' : `${status}, config loaded`}</p>;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  createMsalInstance.mockClear();
});

test('with Microsoft sign-in off, MSAL is never initialised', async () => {
  serveConfig(false);
  render(
    <AuthProvider>
      <StatusProbe />
    </AuthProvider>,
  );
  expect(await screen.findByText('signed-out, config loaded')).toBeTruthy();
  expect(createMsalInstance).not.toHaveBeenCalled();
});

test('with Microsoft sign-in on, MSAL is initialised once, ahead of the click', async () => {
  serveConfig(true);
  render(
    <AuthProvider>
      <StatusProbe />
    </AuthProvider>,
  );
  expect(await screen.findByText('signed-out, config loaded')).toBeTruthy();
  await vi.waitFor(() => expect(createMsalInstance).toHaveBeenCalledTimes(1));
});
