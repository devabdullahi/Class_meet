import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, test } from 'vitest';
import { CreateGroupPage } from './CreateGroupPage';

afterEach(cleanup);

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/groups/create']}>
      <Routes>
        <Route path="/groups/create" element={<CreateGroupPage />} />
        <Route path="/" element={<h1>Dashboard</h1>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

async function fillDetails(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText('Meeting day'), 'Tuesday');
  // Native time-picker UI is browser-owned; supply its normalized value in jsdom.
  fireEvent.change(screen.getByLabelText('Meeting time (local time)'), {
    target: { value: '14:30' },
  });
  await user.type(screen.getByLabelText('Maximum members'), '4');
  await user.type(screen.getByLabelText('Study goal'), 'Review for the exam');
  await user.type(screen.getByLabelText('Meeting location'), 'Central Library');
}

test('explains that course selection and saving are unavailable', () => {
  renderPage();
  expect((screen.getByLabelText('Course') as HTMLSelectElement).disabled).toBe(true);
  expect(screen.getByRole('option', { name: 'No courses available yet' })).toBeTruthy();
  expect(screen.getByText(/Groups cannot be saved yet/)).toBeTruthy();
});

test.each([
  'Meeting day', 'Meeting time (local time)', 'Maximum members',
  'Study goal', 'Meeting location',
])('requires %s before submitting', async (label) => {
  const user = renderPage();
  await fillDetails(user);
  const field = screen.getByLabelText(label) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  fireEvent.change(field, { target: { value: '' } });
  await user.click(screen.getByRole('button', { name: 'Create Group' }));
  expect(field.validity.valueMissing).toBe(true);
  expect(screen.queryByRole('alert')).toBeNull();
});

test.each(['0', '-1', '2.5'])('rejects invalid member count %s', async (count) => {
  const user = renderPage();
  await fillDetails(user);
  const field = screen.getByLabelText('Maximum members') as HTMLInputElement;
  await user.clear(field);
  await user.type(field, count);
  await user.click(screen.getByRole('button', { name: 'Create Group' }));
  expect(field.checkValidity()).toBe(false);
  expect(screen.queryByRole('alert')).toBeNull();
});

test.each(['Study goal', 'Meeting location'])('rejects whitespace-only %s', async (label) => {
  const user = renderPage();
  await fillDetails(user);
  await user.clear(screen.getByLabelText(label));
  await user.type(screen.getByLabelText(label), '   ');
  await user.click(screen.getByRole('button', { name: 'Create Group' }));
  expect(screen.getByRole('alert').textContent).toBe('Enter a study goal and meeting location.');
});

test('online format shows link guidance and clears location in both directions', async () => {
  const user = renderPage();
  await user.type(screen.getByLabelText('Meeting location'), 'Library');
  await user.selectOptions(screen.getByLabelText('Meeting format'), 'online');
  const link = screen.getByLabelText('Meeting link') as HTMLInputElement;
  expect(link.value).toBe('');
  expect(screen.queryByLabelText('Meeting location')).toBeNull();
  const help = screen.getByText(/Create a meeting in Teams, Zoom, or Google Meet/);
  expect(link.getAttribute('aria-describedby')).toBe(help.id);
  await user.type(link, 'https://example.com/meeting');
  await user.selectOptions(screen.getByLabelText('Meeting format'), 'in-person');
  expect((screen.getByLabelText('Meeting location') as HTMLInputElement).value).toBe('');
  expect(screen.queryByText(/Create a meeting in Teams/)).toBeNull();
});

test.each(['', 'not-a-link'])('blocks submission with invalid online link %j', async (value) => {
  const user = renderPage();
  await fillDetails(user);
  await user.selectOptions(screen.getByLabelText('Meeting format'), 'online');
  const link = screen.getByLabelText('Meeting link') as HTMLInputElement;
  if (value) await user.type(link, value);
  await user.click(screen.getByRole('button', { name: 'Create Group' }));
  expect(link.checkValidity()).toBe(false);
  expect(screen.queryByRole('alert')).toBeNull();
});

test.each(['in-person', 'online'])('valid %s details show unavailable feedback without claiming success', async (format) => {
  const user = renderPage();
  await fillDetails(user);
  if (format === 'online') {
    await user.selectOptions(screen.getByLabelText('Meeting format'), 'online');
    await user.type(screen.getByLabelText('Meeting link'), 'https://example.com/meeting');
  }
  await user.click(screen.getByRole('button', { name: 'Create Group' }));
  expect(screen.getByRole('alert').textContent).toBe(
    'Your group has not been created. Course selection and group creation are not available yet.',
  );
  await user.type(screen.getByLabelText('Study goal'), ' together');
  expect(screen.queryByRole('alert')).toBeNull();
});

test.each([/Back/, /^Cancel$/])('%s navigates to the dashboard', async (name) => {
  const user = renderPage();
  await user.click(screen.getByRole('link', { name }));
  expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy();
});
