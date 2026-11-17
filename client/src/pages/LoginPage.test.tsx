import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { LoginPage } from './LoginPage';

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ status: 'signed-in', user: { id: 'u1' }, error: null, config: null }),
}));

afterEach(cleanup);

function renderSignedInLogin(from: unknown) {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state: { from } }]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/groups/:courseId/:groupId" element={<h1>Group page</h1>} />
        <Route path="/" element={<h1>My courses</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

test('after signing in, the student returns to the page they were sent from', async () => {
  renderSignedInLogin('/groups/c1/g1');
  expect(await screen.findByRole('heading', { name: 'Group page' })).toBeTruthy();
});

test.each([
  ['no remembered page', undefined],
  ['another site', '//evil.example/steal'],
  ['the login page itself', '/login'],
  ['something that is not a path', 42],
])('with %s, the student goes to My courses', async (_case, from) => {
  renderSignedInLogin(from);
  expect(await screen.findByRole('heading', { name: 'My courses' })).toBeTruthy();
});
