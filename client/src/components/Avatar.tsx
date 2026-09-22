import type { ReactNode } from 'react';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((part) => part.length > 0);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return (first + last).toUpperCase();
}

export interface AvatarProps {
  name: string;
  size?: number;
}

/**
 * Initials, always. Entra ID issues no picture URL in its tokens — a profile
 * photo lives behind a Microsoft Graph call (`/me/photo/$value`) that needs its
 * own permission and its own error handling. Sign-in does not need a photo, so
 * there is no image path here to go wrong. F2 (student profile) is where a
 * real picture belongs.
 */
export function Avatar({ name, size = 40 }: AvatarProps): ReactNode {
  const dimension = `${String(size)}px`;

  return (
    <span
      className="avatar avatar--initials"
      style={{ width: dimension, height: dimension }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
