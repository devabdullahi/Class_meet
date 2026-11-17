/**
 * A quiet button for an action that takes something away (leave a group,
 * remove a course), which asks once, in place, before doing it.
 *
 * In place rather than in a dialog: the question appears where the student
 * clicked, next to what it is about. Opening it moves focus to Cancel, the
 * safe choice; Cancel or Escape closes it and returns focus to the button.
 * The action keeps its name on both buttons ("Leave group"), so the student
 * confirms exactly what they asked for. A failure is shown inside the
 * question, which stays open so they can try again or cancel.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { describeError } from '../hooks/useApiData';

interface InlineConfirmProps {
  /** The action's name, on the button and on the confirming button: "Leave group". */
  label: string;
  /** Shown on the confirming button while the action runs: "Leaving…". */
  busyLabel: string;
  /** The button's accessible name when `label` alone does not say what it acts on. */
  ariaLabel?: string;
  question: string;
  /** What happens, so the student knows what they are agreeing to. */
  consequence: string;
  /** Shown when the action fails for a reason that is not about the request. */
  failureMessage: string;
  onConfirm: () => Promise<void>;
  /** Extra classes for the closed button, for where it sits on the page. */
  className?: string;
}

export function InlineConfirm({
  label,
  busyLabel,
  ariaLabel,
  question,
  consequence,
  failureMessage,
  onConfirm,
  className,
}: InlineConfirmProps): ReactNode {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Focus returns to the button only after the student closed the question,
  // not when the page first renders it.
  const closedByStudent = useRef(false);
  const id = useId();

  useEffect(() => {
    if (open) {
      cancelRef.current?.focus();
    } else if (closedByStudent.current) {
      closedByStudent.current = false;
      buttonRef.current?.focus();
    }
  }, [open]);

  function close(): void {
    closedByStudent.current = true;
    setError(null);
    setOpen(false);
  }

  async function confirm(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      await onConfirm();
      setOpen(false);
    } catch (failure) {
      setError(describeError(failure, failureMessage));
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape' && !busy) {
      event.stopPropagation();
      close();
    }
  }

  if (!open) {
    return (
      <button
        ref={buttonRef}
        type="button"
        className={['cm-btn cm-btn--quiet cm-btn--sm', className].filter(Boolean).join(' ')}
        aria-label={ariaLabel}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
    );
  }

  return (
    <div
      className="cm-confirm"
      role="group"
      aria-labelledby={`${id}-question`}
      aria-describedby={`${id}-consequence`}
      onKeyDown={handleKeyDown}
    >
      <p id={`${id}-question`} className="cm-confirm__question">
        {question}
      </p>
      <p id={`${id}-consequence`} className="cm-confirm__consequence">
        {consequence}
      </p>
      {error !== null && (
        <p className="cm-field-error" role="alert">
          {error}
        </p>
      )}
      <div className="cm-confirm__actions">
        <button ref={cancelRef} type="button" className="cm-btn cm-btn--quiet cm-btn--sm" disabled={busy} onClick={close}>
          Cancel
        </button>
        <button type="button" className="cm-btn cm-btn--danger cm-btn--sm" disabled={busy} onClick={() => void confirm()}>
          {busy ? busyLabel : label}
        </button>
      </div>
    </div>
  );
}
