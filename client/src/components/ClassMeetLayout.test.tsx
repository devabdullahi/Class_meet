import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { ClassMeetLayout } from './ClassMeetLayout';

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Dev Student', email: 'dev@mavs.uta.edu' },
    signOut: () => Promise.resolve(),
  }),
}));

afterEach(cleanup);

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

test('My Groups is the current page at /my-groups', () => {
  renderAt('/my-groups');
  expect(current()).toEqual(['My groups']);
});
