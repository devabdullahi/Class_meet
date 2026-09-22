import type { ReactNode } from 'react';

export function FullPageSpinner({ label }: { label: string }): ReactNode {
  return (
    <div className="full-page-state" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <p className="full-page-state__label">{label}…</p>
    </div>
  );
}
