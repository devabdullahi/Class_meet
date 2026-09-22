/**
 * The sign-in button.
 *
 * Unlike Google Identity Services, MSAL ships no button widget and no script
 * that has to be loaded from the provider's origin — the whole flow is library
 * code in our bundle. So this is an ordinary `<button>`, which means it looks
 * like the rest of the app, needs no polling for a global to appear, and
 * cannot be broken by a tracking blocker.
 *
 * The label says "UTA account" rather than "Microsoft" because that is the
 * decision the student is making; the Microsoft mark next to it says whose
 * sign-in page is about to open.
 */
import type { ReactNode } from 'react';
import { MicrosoftIcon } from './icons';

export interface EntraSignInButtonProps {
  onClick: () => void;
  /** True while the popup is open or the token is being exchanged. */
  busy: boolean;
  /** False until the server has said how to reach Entra. */
  ready: boolean;
}

export function EntraSignInButton({ onClick, busy, ready }: EntraSignInButtonProps): ReactNode {
  return (
    <button
      type="button"
      className="button button--signin"
      onClick={onClick}
      disabled={busy || !ready}
    >
      <span className="button__icon">
        <MicrosoftIcon />
      </span>
      {busy ? 'Signing you in…' : 'Sign in with your UTA account'}
    </button>
  );
}
