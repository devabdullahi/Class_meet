import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckIcon, CopyIcon } from './icons';

/** How long the button says "Copied" before it offers to copy again. */
const COPIED_CONFIRMATION_MS = 2500;

interface CopyLinkFieldProps {
  url: string;
  inputId: string;
  /** For when no visible <label htmlFor={inputId}> names the field. */
  ariaLabel?: string;
  autoFocusButton?: boolean;
}

/**
 * A link shown in a read-only field with a Copy link button.
 *
 * The clipboard API needs a secure context and the browser's permission, so
 * it is not always there (an http address on a phone, a locked-down lab
 * machine). When it is missing or refuses, the link is selected instead and
 * the student is told to press Ctrl+C: a copy they finish themselves beats a
 * button that silently does nothing.
 */
export function CopyLinkField({ url, inputId, ariaLabel, autoFocusButton = false }: CopyLinkFieldProps): ReactNode {
  const inputRef = useRef<HTMLInputElement>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'select-to-copy'>('idle');

  useEffect(() => {
    if (copyState !== 'copied') return undefined;
    const timer = window.setTimeout(() => setCopyState('idle'), COPIED_CONFIRMATION_MS);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  const selectLink = (): void => {
    inputRef.current?.focus();
    inputRef.current?.select();
  };

  // Once the hint has rendered, so a screen reader landing on the field
  // hears it too (aria-describedby).
  useEffect(() => {
    if (copyState === 'select-to-copy') selectLink();
  }, [copyState]);

  async function copyLink(): Promise<void> {
    try {
      if (navigator.clipboard === undefined) throw new Error('No clipboard API in this context.');
      await navigator.clipboard.writeText(url);
      setCopyState('copied');
    } catch {
      // Handled by falling back rather than reporting a failure: the link is
      // selected and the hint says how to finish copying it. Selected here
      // too, for a second press when the hint is already showing.
      selectLink();
      setCopyState('select-to-copy');
    }
  }

  const copied = copyState === 'copied';
  const hintId = `${inputId}-copy-hint`;
  return (
    <div className="cm-copy-link">
      <div className="cm-copy-link__row">
        <input
          ref={inputRef}
          id={inputId}
          className="cm-input"
          type="text"
          readOnly
          value={url}
          aria-label={ariaLabel}
          aria-describedby={copyState === 'select-to-copy' ? hintId : undefined}
          onFocus={(event) => event.currentTarget.select()}
        />
        {/* Both labels are laid over each other, so the button keeps one width
            and the field beside it does not jump when the label changes. */}
        <button
          type="button"
          className="cm-btn cm-btn--primary cm-copy-link__button"
          onClick={() => void copyLink()}
          autoFocus={autoFocusButton}
        >
          <span className="cm-copy-link__face" aria-hidden={copied} data-shown={!copied}>
            <CopyIcon />
            Copy link
          </span>
          <span className="cm-copy-link__face" aria-hidden={!copied} data-shown={copied}>
            <CheckIcon />
            Copied
          </span>
        </button>
      </div>
      <span className="cm-sr-only" role="status">
        {copied ? 'Link copied.' : ''}
      </span>
      {copyState === 'select-to-copy' && (
        <p id={hintId} className="cm-hint cm-copy-link__hint">
          The link is selected. Press Ctrl+C (⌘C on a Mac) to copy it.
        </p>
      )}
    </div>
  );
}
