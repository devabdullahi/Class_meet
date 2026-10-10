import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { AddCourseForm } from './AddCourseForm';

afterEach(cleanup);

test('wraps keyboard focus inside the modal', async () => {
  const user = userEvent.setup();
  render(<AddCourseForm onClose={vi.fn()} />);

  const search = screen.getByRole('button', { name: 'Search' });
  const close = screen.getByRole('button', { name: 'Close Add Course' });

  search.focus();
  await user.tab();
  expect(document.activeElement).toBe(close);

  await user.tab({ shift: true });
  expect(document.activeElement).toBe(search);
});

test('calls onClose when Escape is pressed', async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(<AddCourseForm onClose={onClose} />);

  await user.click(
    screen.getByRole('textbox', { name: 'Course name or code' }),
  );
  await user.keyboard('{Escape}');

  expect(onClose).toHaveBeenCalledTimes(1);
});

test('calls onClose when Cancel is clicked', async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(<AddCourseForm onClose={onClose} />);

  await user.click(screen.getByRole('button', { name: 'Cancel' }));

  expect(onClose).toHaveBeenCalledTimes(1);
});

test('clears validation when the user types', async () => {
  const user = userEvent.setup();
  render(<AddCourseForm onClose={vi.fn()} />);

  await user.click(screen.getByRole('button', { name: 'Search' }));
  expect(screen.getByRole('alert').textContent).toBe(
    'Enter a course name or course code.',
  );

  await user.type(
    screen.getByRole('textbox', { name: 'Course name or code' }),
    'CSE 3311',
  );

  expect(screen.queryByRole('alert')).toBeNull();
});

test('shows validation when searching with an empty input', async () => {
  const user = userEvent.setup();
  render(<AddCourseForm onClose={vi.fn()} />);

  await user.click(screen.getByRole('button', { name: 'Search' }));

  expect(screen.getByRole('alert').textContent).toBe(
    'Enter a course name or course code.',
  );
});
