import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { api, ApiError, type StudentProfile } from '../api';
import { ProfilePage } from './ProfilePage';

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Sara Ahmed', email: 'sara.ahmed@mavs.uta.edu' }, signOut: vi.fn() }),
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      fetchProfile: vi.fn(),
      saveProfile: vi.fn(),
    },
  };
});

const fetchProfile = vi.mocked(api.fetchProfile);
const saveProfile = vi.mocked(api.saveProfile);

const SARA: StudentProfile = {
  major: 'Computer Science',
  year: 'junior',
  meetingPreference: 'on_campus',
  studyStyles: ['practice_problems', 'talking_it_through'],
};

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderPage(state?: { returnTo: string }) {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/profile', state }]}>
      <Routes>
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/" element={<h1>My courses page</h1>} />
        <Route path="/groups/:courseId/:groupId" element={<h1>Group page</h1>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

const preview = () => screen.getByRole('complementary', { name: 'What leaders see' });

test('shows the saved profile in the form and as leaders will see it', async () => {
  fetchProfile.mockResolvedValue({ profile: SARA });
  renderPage();
  expect(((await screen.findByLabelText('Major')) as HTMLInputElement).value).toBe('Computer Science');
  expect((screen.getByLabelText('Year') as HTMLSelectElement).value).toBe('junior');
  expect((screen.getByRole('radio', { name: 'On campus' }) as HTMLInputElement).checked).toBe(true);
  expect((screen.getByRole('checkbox', { name: 'Practice problems' }) as HTMLInputElement).checked).toBe(true);

  expect(within(preview()).getByText('Sara Ahmed')).toBeTruthy();
  expect(preview().textContent).toContain('Computer Science · Junior · On campus');
  expect(within(preview()).getByText('Studies by practice problems and talking it through')).toBeTruthy();
  expect(preview().textContent).toContain('Your email and your other courses are not shown.');
  expect(preview().textContent).not.toContain('sara.ahmed@mavs.uta.edu');
});

test('a student with no profile sees what leaders see now, and the preview follows their choices', async () => {
  fetchProfile.mockResolvedValue({ profile: null });
  const user = renderPage();
  const whatLeadersSee = await screen.findByRole('complementary', { name: 'What leaders see' });
  expect(within(whatLeadersSee).getByText('Has not added a profile yet')).toBeTruthy();

  await user.type(screen.getByLabelText('Major'), 'Software Engineering');
  await user.selectOptions(screen.getByLabelText('Year'), 'senior');
  await user.click(screen.getByRole('radio', { name: 'Either' }));
  await user.click(screen.getByRole('checkbox', { name: 'Quiet, focused work' }));

  expect(preview().textContent).toContain('Software Engineering · Senior · Online or on campus');
  expect(within(preview()).getByText('Studies by quiet, focused work')).toBeTruthy();
  expect(within(preview()).queryByText('Has not added a profile yet')).toBeNull();
});

test('only two study styles can be picked; unpicking one frees the rest', async () => {
  fetchProfile.mockResolvedValue({ profile: SARA });
  const user = renderPage();
  const cramming = (await screen.findByRole('checkbox', { name: 'Exam cramming' })) as HTMLInputElement;
  expect(cramming.disabled).toBe(true);
  expect(screen.getByText('Pick up to two.')).toBeTruthy();

  await user.click(screen.getByRole('checkbox', { name: 'Practice problems' }));
  expect(cramming.disabled).toBe(false);
  await user.click(cramming);
  expect(within(preview()).getByText('Studies by talking it through and exam cramming')).toBeTruthy();
});

test('saving sends the whole profile, blanks as empty, and confirms it', async () => {
  fetchProfile.mockResolvedValue({ profile: SARA });
  saveProfile.mockResolvedValue({ profile: { ...SARA, major: null } });
  const user = renderPage();
  await user.clear(await screen.findByLabelText('Major'));
  await user.selectOptions(screen.getByLabelText('Year'), '');
  await user.click(screen.getByRole('button', { name: 'Save profile' }));

  expect(saveProfile).toHaveBeenCalledWith({ ...SARA, major: null, year: null });
  expect((await screen.findByRole('status')).textContent).toMatch(/^Profile saved\./);
});

test('opened from a group, saving or cancelling goes back to that group', async () => {
  fetchProfile.mockResolvedValue({ profile: null });
  saveProfile.mockResolvedValue({ profile: SARA });
  let user = renderPage({ returnTo: '/groups/c1/g1' });
  expect((await screen.findByRole('link', { name: 'Cancel' })).getAttribute('href')).toBe('/groups/c1/g1');
  await user.type(screen.getByLabelText('Major'), 'Physics');
  await user.click(screen.getByRole('button', { name: 'Save profile' }));
  expect(await screen.findByRole('heading', { name: 'Group page' })).toBeTruthy();

  cleanup();
  user = renderPage({ returnTo: 'https://example.com/' });
  expect((await screen.findByRole('link', { name: 'Cancel' })).getAttribute('href')).toBe('/');
  await user.click(screen.getByRole('link', { name: 'Cancel' }));
  expect(await screen.findByRole('heading', { name: 'My courses page' })).toBeTruthy();
});

test('a failed save keeps what the student entered and says why', async () => {
  fetchProfile.mockResolvedValue({ profile: null });
  saveProfile.mockRejectedValue(new ApiError(400, 'invalid_studyStyles', 'Pick up to 2 study styles.'));
  const user = renderPage();
  await user.type(await screen.findByLabelText('Major'), 'Physics');
  await user.click(screen.getByRole('button', { name: 'Save profile' }));

  expect((await screen.findByRole('alert')).textContent).toBe('Pick up to 2 study styles.');
  expect((screen.getByLabelText('Major') as HTMLInputElement).value).toBe('Physics');
  expect((screen.getByRole('button', { name: 'Save profile' }) as HTMLButtonElement).disabled).toBe(false);
});

test('when the profile cannot be loaded, the page offers Try again instead of an empty form', async () => {
  fetchProfile.mockRejectedValueOnce(new ApiError(503, 'database_unavailable', 'DATABASE_URL is not set'));
  fetchProfile.mockResolvedValue({ profile: SARA });
  const user = renderPage();
  expect((await screen.findByRole('alert')).textContent).toContain('We could not load your profile.');
  expect(screen.queryByLabelText('Major')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  expect(((await screen.findByLabelText('Major')) as HTMLInputElement).value).toBe('Computer Science');
});
