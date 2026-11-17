import { Fragment, type ReactNode } from 'react';
import type { StudentProfile } from '../api';
import { isEmptyProfile, profileFacts, studyStyleLine } from '../profile';
import { Avatar } from './Avatar';

interface RequesterProfileProps {
  name: string;
  profile: StudentProfile | null;
}

/**
 * A student as a leader sees them on a join request: initials, name, then
 * two short lines from their profile (what and when, then how they study).
 * Used for the real requests and for the student's own preview, so the
 * preview cannot drift from what leaders actually see.
 */
export function RequesterProfile({ name, profile }: RequesterProfileProps): ReactNode {
  const hasProfile = profile !== null && !isEmptyProfile(profile);
  const facts = hasProfile ? profileFacts(profile) : [];
  const studyLine = hasProfile ? studyStyleLine(profile) : null;
  return (
    <>
      <Avatar name={name} size={32} />
      <div className="cm-request__who">
        <p className="cm-request__name">{name}</p>
        {!hasProfile && <p className="cm-request__line">Has not added a profile yet</p>}
        {facts.length > 0 && (
          <p className="cm-request__line">
            {facts.map((fact, index) => (
              // A major could read the same as another fact, so the position is the key.
              <Fragment key={index}>
                {index > 0 && ' · '}
                {/* Each fact stays whole when the line wraps. */}
                <span className="cm-request__fact">{fact}</span>
              </Fragment>
            ))}
          </p>
        )}
        {studyLine !== null && <p className="cm-request__line">{studyLine}</p>}
      </div>
    </>
  );
}
