import type { ReactNode } from 'react';

/** The product mark. An inline SVG so there is no image asset to load. */
export function Wordmark({ compact = false }: { compact?: boolean }): ReactNode {
  return (
    <div className={compact ? 'wordmark wordmark--compact' : 'wordmark'}>
      <svg
        className="wordmark__glyph"
        viewBox="0 0 32 32"
        role="img"
        aria-label="Class Meet"
        focusable="false"
      >
        <rect x="1" y="1" width="30" height="30" rx="9" className="wordmark__glyph-bg" />
        <circle cx="12" cy="13" r="3.4" className="wordmark__glyph-dot" />
        <circle cx="21" cy="13" r="3.4" className="wordmark__glyph-dot" />
        <path
          d="M6 24.5c0-3.4 2.7-5.6 6-5.6s6 2.2 6 5.6"
          className="wordmark__glyph-arc"
          fill="none"
        />
        <path
          d="M17 24.5c0-3.4 2.4-5.6 5.4-5.6 2.4 0 4.6 1.2 5.6 3.4"
          className="wordmark__glyph-arc"
          fill="none"
        />
      </svg>
      <span className="wordmark__text">Class Meet</span>
    </div>
  );
}
