import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { MyCoursesPage } from './MyCoursesPage';

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Dev Student', email: 'dev.student@mavs.uta.edu' },
    signOut: () => Promise.resolve(),
  }),
}));

afterEach(cleanup);

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<MyCoursesPage />} />
        <Route path="/groups/create" element={<h1>Create Group page</h1>} />
        <Route path="/groups/:courseId" element={<h1>Groups page</h1>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

test('shows My Courses as the main screen with the signed-in student', () => {
  renderPage();
  expect(screen.getByRole('heading', { level: 1, name: 'My Courses' })).toBeTruthy();
  expect(screen.getByText('dev.student@mavs.uta.edu')).toBeTruthy();
});

test('lists each course with a link to its study groups', async () => {
  const user = renderPage();
  expect(screen.getAllByRole('link', { name: /View Groups/ })).toHaveLength(3);
  await user.click(screen.getAllByRole('link', { name: /View Groups/ })[0]!);
  expect(screen.getByRole('heading', { name: 'Groups page' })).toBeTruthy();
});

test('Add Course opens the dialog and Escape returns focus to the button', async () => {
  const user = renderPage();
  const addCourse = screen.getByRole('button', { name: 'Add Course' });
  await user.click(addCourse);
  expect(screen.getByRole('dialog')).toBeTruthy();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(addCourse);
});

test('Create Group navigates to the create group page', async () => {
  const user = renderPage();
  await user.click(screen.getByRole('link', { name: 'Create Group' }));
  expect(screen.getByRole('heading', { name: 'Create Group page' })).toBeTruthy();
});
