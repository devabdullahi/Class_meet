import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, ApiError } from '../api';
import { EmailCodeSignIn } from './EmailCodeSignIn';

const signInWithEmailCode = vi.fn<(email: string, code: string) => Promise<void>>();

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ config: { emailDomains: ['mavs.uta.edu', 'uta.edu'] }, signInWithEmailCode }),
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, api: { ...actual.api, startEmailSignIn: vi.fn() } };
});

const startEmailSignIn = vi.mocked(api.startEmailSignIn);
const SENT = { email: 'jane@mavs.uta.edu', expiresInSeconds: 600, resendAfterSeconds: 60 };

beforeEach(() => {
  startEmailSignIn.mockResolvedValue(SENT);
  signInWithEmailCode.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

async function reachCodeStep(response = SENT) {
  startEmailSignIn.mockResolvedValueOnce(response);
  const user = userEvent.setup();
  render(<EmailCodeSignIn />);
  await user.type(screen.getByLabelText('UTA email'), 'Jane@mavs.uta.edu');
  await user.click(screen.getByRole('button', { name: 'Email me a code' }));
  await screen.findByLabelText('6-digit code');
  return user;
}

test('a non-UTA address is refused in place, without asking the server', async () => {
  const user = userEvent.setup();
  render(<EmailCodeSignIn />);
  const field = screen.getByLabelText('UTA email');
  await user.type(field, 'jane@gmail.com');
  await user.click(screen.getByRole('button', { name: 'Email me a code' }));

  const alert = screen.getByRole('alert');
  expect(alert.textContent).toBe('Use your UTA email (…@mavs.uta.edu or …@uta.edu).');
  expect(field.getAttribute('aria-invalid')).toBe('true');
  expect(field.getAttribute('aria-describedby')).toBe(alert.id);
  expect(document.activeElement).toBe(field);
  expect(startEmailSignIn).not.toHaveBeenCalled();
});

test("the server's refusal is shown under the field", async () => {
  startEmailSignIn.mockRejectedValueOnce(
    new ApiError(429, 'too_many_requests', 'Too many sign-in attempts. Wait a few minutes, then try again.', 300),
  );
  const user = userEvent.setup();
  render(<EmailCodeSignIn />);
  await user.type(screen.getByLabelText('UTA email'), 'jane@mavs.uta.edu');
  await user.click(screen.getByRole('button', { name: 'Email me a code' }));
  expect((await screen.findByRole('alert')).textContent).toBe(
    'Too many sign-in attempts. Wait a few minutes, then try again.',
  );
  expect(screen.queryByLabelText('6-digit code')).toBeNull();
});

test('after the code is sent, the page asks for it, says where it went, and focuses the field', async () => {
  await reachCodeStep();
  expect(startEmailSignIn).toHaveBeenCalledWith('Jane@mavs.uta.edu');
  expect(screen.getByText(/Enter the code we sent to/).textContent).toBe('Enter the code we sent to jane@mavs.uta.edu');
  const code = screen.getByLabelText('6-digit code');
  expect(document.activeElement).toBe(code);
  expect(code.getAttribute('autocomplete')).toBe('one-time-code');
  expect(code.getAttribute('inputmode')).toBe('numeric');
  expect(screen.getByText(/It expires in 10 minutes/)).toBeTruthy();
});

test('the right code signs in with the address the code was sent to', async () => {
  const user = await reachCodeStep();
  await user.type(screen.getByLabelText('6-digit code'), '042817');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(signInWithEmailCode).toHaveBeenCalledWith('jane@mavs.uta.edu', '042817');
});

test('a pasted code with a space or hyphen keeps only its digits', async () => {
  const user = await reachCodeStep();
  const code = screen.getByLabelText('6-digit code');
  await user.click(code);
  await user.paste('123-456');
  expect((code as HTMLInputElement).value).toBe('123456');
});

test('a short code is caught before it costs one of the five tries', async () => {
  const user = await reachCodeStep();
  await user.type(screen.getByLabelText('6-digit code'), '1234');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(screen.getByRole('alert').textContent).toBe('Enter the 6-digit code from the email.');
  expect(signInWithEmailCode).not.toHaveBeenCalled();
});

test('a wrong code says so under the field, keeps focus there, and leaves the digits to correct', async () => {
  signInWithEmailCode.mockRejectedValueOnce(
    new ApiError(400, 'code_incorrect', 'That code is not right. You have 4 tries left.'),
  );
  const user = await reachCodeStep();
  const code = screen.getByLabelText('6-digit code') as HTMLInputElement;
  await user.type(code, '111111');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toBe('That code is not right. You have 4 tries left.');
  expect(code.getAttribute('aria-describedby')).toBe(alert.id);
  expect(code.getAttribute('aria-invalid')).toBe('true');
  expect(document.activeElement).toBe(code);
  expect(code.value).toBe('111111');
});

test('a code that can no longer work is cleared', async () => {
  signInWithEmailCode.mockRejectedValueOnce(
    new ApiError(400, 'code_used_up', 'That code is not right, and it was the last try. Send yourself a new code.'),
  );
  const user = await reachCodeStep();
  const code = screen.getByLabelText('6-digit code') as HTMLInputElement;
  await user.type(code, '111111');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/last try/);
  expect(code.value).toBe('');
});

test('resend waits for its countdown, then sends a new code', async () => {
  const user = await reachCodeStep({ ...SENT, resendAfterSeconds: 1 });
  const waiting = screen.getByRole('button', { name: /Resend code in 0:0\d/ });
  expect((waiting as HTMLButtonElement).disabled).toBe(true);

  const resend = await screen.findByRole('button', { name: 'Resend code' }, { timeout: 3000 });
  expect((resend as HTMLButtonElement).disabled).toBe(false);
  await user.click(resend);

  expect(startEmailSignIn).toHaveBeenLastCalledWith('jane@mavs.uta.edu');
  expect((await screen.findByRole('status')).textContent).toBe(
    'We sent a new code to jane@mavs.uta.edu. Only the newest code works.',
  );
  expect(screen.getByRole('button', { name: /Resend code in 1:00/ })).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByLabelText('6-digit code'));
});

test('if a code was sent moments ago, the page goes straight to entering it', async () => {
  startEmailSignIn.mockRejectedValueOnce(
    new ApiError(429, 'resend_too_soon', 'We just sent a code to this address.', 42),
  );
  const user = userEvent.setup();
  render(<EmailCodeSignIn />);
  await user.type(screen.getByLabelText('UTA email'), 'jane@mavs.uta.edu');
  await user.click(screen.getByRole('button', { name: 'Email me a code' }));

  expect(await screen.findByLabelText('6-digit code')).toBeTruthy();
  expect(screen.getByRole('status').textContent).toBe(
    'We already sent a code to this address a moment ago. Enter it below.',
  );
  expect(screen.getByRole('button', { name: /Resend code in 0:4\d/ })).toBeTruthy();
});

test('"Use a different email" goes back with the address kept and focused', async () => {
  const user = await reachCodeStep();
  await user.click(screen.getByRole('button', { name: 'Use a different email' }));
  const field = screen.getByLabelText('UTA email') as HTMLInputElement;
  expect(field.value).toBe('Jane@mavs.uta.edu');
  expect(document.activeElement).toBe(field);
  expect(screen.queryByRole('alert')).toBeNull();
});
