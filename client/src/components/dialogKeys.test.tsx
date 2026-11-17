import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { handleDialogKeys } from './dialogKeys';

afterEach(cleanup);

// Every kind of form control a dialog may start or end with, so the trap
// does not let Tab escape past a select or a textarea at either edge.
function DialogFromSelectToTextarea({ onClose }: { onClose: () => void }) {
  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label="Test dialog"
      onKeyDown={(event) => handleDialogKeys(event, onClose)}
    >
      <select aria-label="Who">
        <option>The whole group</option>
      </select>
      <button type="button">Middle</button>
      <textarea aria-label="Details" />
    </section>
  );
}

test('keeps Tab and Shift+Tab inside a dialog that starts with a select and ends with a textarea', async () => {
  const user = userEvent.setup();
  render(
    <>
      <DialogFromSelectToTextarea onClose={vi.fn()} />
      <button type="button">Outside</button>
    </>,
  );
  const select = screen.getByRole('combobox', { name: 'Who' });
  const textarea = screen.getByRole('textbox', { name: 'Details' });

  textarea.focus();
  await user.tab();
  expect(document.activeElement).toBe(select);

  await user.tab({ shift: true });
  expect(document.activeElement).toBe(textarea);
});

test('closes the dialog on Escape', async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(<DialogFromSelectToTextarea onClose={onClose} />);
  screen.getByRole('button', { name: 'Middle' }).focus();
  await user.keyboard('{Escape}');
  expect(onClose).toHaveBeenCalledOnce();
});
