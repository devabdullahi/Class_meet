import type { ReactNode } from 'react';

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function BookIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H5.5A1.5 1.5 0 0 1 4 15.5z" {...STROKE} />
      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h4.5a1.5 1.5 0 0 0 1.5-1.5z" {...STROKE} />
    </svg>
  );
}

export function PeopleIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="9" cy="8" r="3.2" {...STROKE} />
      <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" {...STROKE} />
      <circle cx="17" cy="9" r="2.4" {...STROKE} />
      <path d="M16 14.6a4.6 4.6 0 0 1 4.5 4.9" {...STROKE} />
    </svg>
  );
}

export function LogoutIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M15 4.5h2.5A2 2 0 0 1 19.5 6.5v11a2 2 0 0 1-2 2H15" {...STROKE} />
      <path d="M11 8.5 7.5 12l3.5 3.5" {...STROKE} />
      <path d="M7.5 12h8" {...STROKE} />
    </svg>
  );
}

/**
 * The Microsoft four-square mark. Fixed brand colours, not `currentColor`:
 * Microsoft's identity guidelines require the logo be shown in its own
 * colours, and it is the one thing on the sign-in button that tells a student
 * which credentials they are about to be asked for.
 */
export function MicrosoftIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="9" height="9" fill="#f25022" />
      <rect x="13" y="2" width="9" height="9" fill="#7fba00" />
      <rect x="2" y="13" width="9" height="9" fill="#00a4ef" />
      <rect x="13" y="13" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

export function PinIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 0 0-13 0C5.5 15.4 12 21 12 21z" {...STROKE} />
      <circle cx="12" cy="10" r="2.3" {...STROKE} />
    </svg>
  );
}

export function VideoIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3.5" y="6.5" width="12" height="11" rx="2.2" {...STROKE} />
      <path d="m15.5 11 5-2.8v7.6l-5-2.8" {...STROKE} />
    </svg>
  );
}

export function CalendarIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" {...STROKE} />
      <path d="M3.5 10h17M8 3v4M16 3v4" {...STROKE} />
    </svg>
  );
}

export function CheckCircleIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8.5" {...STROKE} />
      <path d="m8.5 12.3 2.4 2.4 4.6-5" {...STROKE} />
    </svg>
  );
}

export function AlertIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 4.5 21 19.5H3z" {...STROKE} />
      <path d="M12 10v4.2M12 16.9v.1" {...STROKE} />
    </svg>
  );
}

export function PlusIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 5v14M5 12h14" {...STROKE} />
    </svg>
  );
}

export function ChevronLeftIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m14.5 6-6 6 6 6" {...STROKE} />
    </svg>
  );
}
