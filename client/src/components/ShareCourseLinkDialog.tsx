import type { ReactNode } from 'react';
import { courseLinkUrl } from '../courseLink';
import { CopyLinkField } from './CopyLinkField';
import { handleDialogKeys } from './dialogKeys';
import { CloseIcon } from './icons';

interface ShareCourseLinkDialogProps {
  courseCode: string;
  /** Should put focus back on the button that opened the dialog, as Add course does on My courses. */
  onClose: () => void;
}

/** The course link, ready to copy, with a word on who can use it and where to post it. */
export function ShareCourseLinkDialog({ courseCode, onClose }: ShareCourseLinkDialogProps): ReactNode {
  return (
    <div className="cm-dialog-backdrop">
      <section
        className="cm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-course-title"
        onKeyDown={(event) => handleDialogKeys(event, onClose)}
      >
        <header className="cm-dialog__header">
          <h2 id="share-course-title">Share {courseCode}</h2>
          <button type="button" className="cm-btn cm-btn--icon" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </header>

        <div className="cm-share">
          <p className="cm-panel__text">
            Anyone with a UTA account who opens this link can add {courseCode} in one tap and see its study groups.
          </p>
          <div className="cm-form-field">
            <label className="cm-label" htmlFor="course-link">
              Course link
            </label>
            <CopyLinkField url={courseLinkUrl(courseCode)} inputId="course-link" autoFocusButton />
            <p className="cm-hint">
              Post it in the course Discord or GroupMe, or ask your instructor to add it to Canvas.
            </p>
          </div>
        </div>

        <footer className="cm-dialog__footer">
          <button type="button" className="cm-btn cm-btn--secondary" onClick={onClose}>
            Done
          </button>
        </footer>
      </section>
    </div>
  );
}
