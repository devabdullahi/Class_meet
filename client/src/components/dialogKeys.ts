import type { KeyboardEvent } from 'react';

/**
 * For a modal dialog's onKeyDown: keeps Tab and Shift+Tab inside the dialog,
 * and closes it on Escape. Shared by every dialog so they all behave alike.
 */
export function handleDialogKeys(event: KeyboardEvent<HTMLElement>, onClose: () => void): void {
  if (event.key === 'Escape') {
    event.stopPropagation();
    onClose();
    return;
  }
  if (event.key !== 'Tab') return;

  const controls = event.currentTarget.querySelectorAll<HTMLElement>(
    'button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled)',
  );
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (first === undefined || last === undefined) return;

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
