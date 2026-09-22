import type { ReactNode } from 'react';

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  body: string;
  /** Which roadmap iteration delivers this. Keeps the shell honest. */
  arrivingIn: string;
}

export function EmptyState({ icon, title, body, arrivingIn }: EmptyStateProps): ReactNode {
  return (
    <div className="empty">
      <div className="empty__icon" aria-hidden="true">
        {icon}
      </div>
      <h3 className="empty__title">{title}</h3>
      <p className="empty__body">{body}</p>
      <span className="badge badge--soon">{arrivingIn}</span>
    </div>
  );
}
