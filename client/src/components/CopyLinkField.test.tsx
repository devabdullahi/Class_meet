import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { CopyLinkField } from './CopyLinkField';

const LINK = 'https://classmeet.example/join/CSE-3311';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function renderField() {
  // user-event installs a clipboard stand-in on navigator.clipboard here.
  const user = userEvent.setup();
  render(<CopyLinkField url={LINK} inputId="course-link" ariaLabel="Course link" />);
  return user;
}

function expectLinkSelectedWithHint(): void {
  const field = screen.getByRole('textbox', { name: 'Course link' }) as HTMLInputElement;
  expect(document.activeElement).toBe(field);
  expect([field.selectionStart, field.selectionEnd]).toEqual([0, LINK.length]);
  const hint = screen.getByText('The link is selected. Press Ctrl+C (⌘C on a Mac) to copy it.');
  expect(field.getAttribute('aria-describedby')).toBe(hint.id);
}

test('copies the link and says so', async () => {
  const user = renderField();
  await user.click(screen.getByRole('button', { name: 'Copy link' }));
  expect(await navigator.clipboard.readText()).toBe(LINK);
  expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
  expect(screen.getByRole('status').textContent).toBe('Link copied.');
});

test('offers to copy again a moment after copying', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  renderField();
  // fireEvent rather than user-event, whose own pauses wait on the faked timers.
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
  });
  expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
  act(() => {
    vi.advanceTimersByTime(2500);
  });
  expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
  expect(screen.getByRole('status').textContent).toBe('');
});

test('when the browser refuses the clipboard, selects the link and says how to copy it', async () => {
  const user = renderField();
  vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
  await user.click(screen.getByRole('button', { name: 'Copy link' }));
  expectLinkSelectedWithHint();
  expect(screen.queryByRole('button', { name: 'Copied' })).toBeNull();
});

test('without a clipboard API (an http address), selects the link and says how to copy it', async () => {
  const user = renderField();
  vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue(undefined as unknown as Clipboard);
  await user.click(screen.getByRole('button', { name: 'Copy link' }));
  expectLinkSelectedWithHint();
});

test('focusing the field selects the whole link', async () => {
  const user = renderField();
  await user.click(screen.getByRole('textbox', { name: 'Course link' }));
  const field = screen.getByRole('textbox', { name: 'Course link' }) as HTMLInputElement;
  expect([field.selectionStart, field.selectionEnd]).toEqual([0, LINK.length]);
});
