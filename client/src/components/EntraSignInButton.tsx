/**
 * Microsoft sign-in, offered beside the emailed code only when the server
 * turns it on (ENABLE_MICROSOFT_LOGIN): UTA's tenant needs an administrator
 * to approve the app before students can use it.
 *
 * MSAL ships no button widget and no script that has to be loaded from the
 * provider's origin, so this is an ordinary `<button>`. It is secondary
 * because the emailed code is the card's primary action; the Microsoft mark
 * says whose sign-in page is about to open.
 */
import type { ReactNode } from 'react';
import { MicrosoftIcon } from './icons';

export interface EntraSignInButtonProps {
  onClick: () => void;
  /** True while the popup is open or the token is being exchanged. */
  busy: boolean;
}

export function EntraSignInButton({ onClick, busy }: EntraSignInButtonProps): ReactNode {
  return (
    <button type="button" className="cm-btn cm-btn--secondary cm-btn--block" onClick={onClick} disabled={busy}>
      <MicrosoftIcon />
      {busy ? 'Signing you in…' : 'Sign in with Microsoft'}
    </button>
  );
}
