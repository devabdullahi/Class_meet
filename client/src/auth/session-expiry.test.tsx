import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api } from '../api';
import { useApiData } from '../hooks/useApiData';
import { AuthProvider } from './AuthProvider';
import { RequireAuth } from './RequireAuth';

const USER = { id: 'u1', email: 'sam@mavs.uta.edu', name: 'Sam Lee', createdAt: '', lastLoginAt: '' };

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Signed in when the app opens; the session then expires before the page loads its data. */
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) => {
      if (path === '/api/auth/me') return reply(200, { user: USER });
      if (path === '/api/auth/config') return reply(200, { emailDomains: ['mavs.uta.edu'], microsoftLoginEnabled: false, devLoginEnabled: false });
      return reply(401, { error: { code: 'not_authenticated', message: 'You are not signed in.' } });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function MyGroupsProbe() {
  useApiData(() => api.fetchMyGroups(), []);
  return <h1>My groups</h1>;
}

function LoginProbe() {
  const from = (useLocation().state as { from?: string } | null)?.from;
  return <h1>Sign in, then back to {from}</h1>;
}

test('a 401 from the API signs the app out and sends the student to sign in, remembering the page', async () => {
  render(
    <MemoryRouter initialEntries={['/my-groups']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginProbe />} />
          <Route path="/my-groups" element={<RequireAuth><MyGroupsProbe /></RequireAuth>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
  expect(await screen.findByRole('heading', { name: 'Sign in, then back to /my-groups' })).toBeTruthy();
});
