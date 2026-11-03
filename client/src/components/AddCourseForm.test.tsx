import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { api, ApiError } from '../api';
import { AddCourseForm } from './AddCourseForm';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, api: { ...actual.api, searchCourses: vi.fn(), enrollInCourse: vi.fn() } };
});

const searchCourses = vi.mocked(api.searchCourses);
const enrollInCourse = vi.mocked(api.enrollInCourse);

const OOSE = { id: 'c1', code: 'CSE 3311', title: 'Object Oriented Software Engineering', enrolled: false };

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

test('focuses the input when the accessible dialog opens', () => {
  render(<AddCourseForm onClose={vi.fn()} />);
  expect(screen.getByRole('dialog', { name: 'Add Course' }).getAttribute('aria-modal')).toBe('true');
  expect(document.activeElement).toBe(screen.getByLabelText('Course name or code'));
});

test('close icon calls onClose once', async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(<AddCourseForm onClose={onClose} />);
  await user.click(screen.getByRole('button', { name: 'Close Add Course' }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('whitespace search is invalid and linked to its error message', async () => {
  const user = userEvent.setup();
  render(<AddCourseForm onClose={vi.fn()} />);
  const input = screen.getByLabelText('Course name or code');
  await user.type(input, '   ');
  await user.click(screen.getByRole('button', { name: 'Search' }));
  const alert = screen.getByRole('alert');
  expect(alert.textContent).toBe('Enter a course name or course code.');
  expect(input.getAttribute('aria-invalid')).toBe('true');
  expect(input.getAttribute('aria-describedby')).toBe(alert.id);
  await user.type(input, 'C');
  expect(input.getAttribute('aria-invalid')).toBe('false');
  expect(input.hasAttribute('aria-describedby')).toBe(false);
});

test('Enter searches the catalog and lists the matching courses', async () => {
  searchCourses.mockResolvedValue({ courses: [OOSE] });
  const user = userEvent.setup();
  render(<AddCourseForm onClose={vi.fn()} />);
  await user.type(screen.getByLabelText('Course name or code'), ' CSE 3311 {Enter}');
  expect(searchCourses).toHaveBeenCalledWith('CSE 3311');
  expect(await screen.findByText('Object Oriented Software Engineering', { exact: false })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Add CSE 3311' })).toBeTruthy();
});

test('says so when no course matches', async () => {
  searchCourses.mockResolvedValue({ courses: [] });
  const user = userEvent.setup();
  render(<AddCourseForm onClose={vi.fn()} />);
  await user.type(screen.getByLabelText('Course name or code'), 'ZZZ{Enter}');
  expect((await screen.findByRole('status')).textContent).toBe('No courses match that search.');
});

test('adding a course enrolls the student, marks it added and tells the page', async () => {
  searchCourses.mockResolvedValue({ courses: [OOSE] });
  enrollInCourse.mockResolvedValue({ course: OOSE });
  const onAdded = vi.fn();
  const user = userEvent.setup();
  render(<AddCourseForm onClose={vi.fn()} onAdded={onAdded} />);
  await user.type(screen.getByLabelText('Course name or code'), 'CSE{Enter}');
  await user.click(await screen.findByRole('button', { name: 'Add CSE 3311' }));
  expect(enrollInCourse).toHaveBeenCalledWith('c1');
  expect(onAdded).toHaveBeenCalledTimes(1);
  const added = (await screen.findByRole('button', { name: 'CSE 3311 already added' })) as HTMLButtonElement;
  expect(added.disabled).toBe(true);
  expect(screen.getByText('CSE 3311 was added to your courses.')).toBeTruthy();
});

test('a course the student already has cannot be added again', async () => {
  searchCourses.mockResolvedValue({ courses: [{ ...OOSE, enrolled: true }] });
  const user = userEvent.setup();
  render(<AddCourseForm onClose={vi.fn()} />);
  await user.type(screen.getByLabelText('Course name or code'), 'CSE{Enter}');
  const button = (await screen.findByRole('button', { name: 'CSE 3311 already added' })) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
});

test('shows the server message when the search fails and clears it on typing', async () => {
  searchCourses.mockRejectedValue(new ApiError(503, 'database_unavailable', 'Could not reach the database.'));
  const user = userEvent.setup();
  render(<AddCourseForm onClose={vi.fn()} />);
  await user.type(screen.getByLabelText('Course name or code'), 'CSE{Enter}');
  expect((await screen.findByRole('alert')).textContent).toBe('Could not reach the database.');
  await user.type(screen.getByLabelText('Course name or code'), 'A');
  expect(screen.queryByRole('alert')).toBeNull();
});

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
