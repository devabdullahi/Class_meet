import { useEffect, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { api, type CourseSearchResult } from '../api';
import { describeError } from '../hooks/useApiData';
import { AlertIcon, CheckIcon, CloseIcon } from './icons';

interface AddCourseFormProps {
  onClose: () => void;
  /** Called after a course is added, so the page behind the dialog can refresh. */
  onAdded?: () => void;
}

/** Keeps Tab and Shift+Tab inside the dialog, and closes it on Escape. */
function handleDialogKeys(event: KeyboardEvent<HTMLElement>, onClose: () => void): void {
  if (event.key === 'Escape') {
    event.stopPropagation();
    onClose();
    return;
  }
  if (event.key !== 'Tab') return;

  const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)');
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (first === undefined || last === undefined) return;

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function AddCourseForm({ onClose, onAdded }: AddCourseFormProps): ReactNode {
  const [searchText, setSearchText] = useState('');
  const [searchError, setSearchError] = useState('');
  const [results, setResults] = useState<CourseSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [addingCourseId, setAddingCourseId] = useState<string | null>(null);
  const [addError, setAddError] = useState('');
  const [addedMessage, setAddedMessage] = useState('');
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  // The Add button is replaced by an "Added" label; keep keyboard focus on
  // that row instead of letting it fall back to the page behind the dialog.
  useEffect(() => {
    if (justAddedId !== null) document.getElementById(`course-added-${justAddedId}`)?.focus();
  }, [justAddedId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!searchText.trim()) {
      setSearchError('Enter a course name or course code.');
      return;
    }

    setSearchError('');
    setAddError('');
    setAddedMessage('');
    setSearching(true);
    try {
      const reply = await api.searchCourses(searchText.trim());
      setResults(reply.courses);
    } catch (failure) {
      setResults(null);
      setSearchError(describeError(failure, 'We could not search the course list. Please try again.'));
    } finally {
      setSearching(false);
    }
  }

  async function handleAdd(course: CourseSearchResult): Promise<void> {
    setAddError('');
    setAddingCourseId(course.id);
    try {
      await api.enrollInCourse(course.id);
      setResults((current) =>
        current === null
          ? current
          : current.map((item) => (item.id === course.id ? { ...item, enrolled: true } : item)),
      );
      setAddedMessage(`${course.code} was added to your courses.`);
      setJustAddedId(course.id);
      onAdded?.();
    } catch (failure) {
      setAddError(describeError(failure, `We could not add ${course.code}. Please try again.`));
    } finally {
      setAddingCourseId(null);
    }
  }

  return (
    <div className="cm-dialog-backdrop">
      <section
        className="cm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-course-title"
        onKeyDown={(event) => handleDialogKeys(event, onClose)}
      >
        <header className="cm-dialog__header">
          <h2 id="add-course-title">Add a course</h2>
          <button type="button" className="cm-btn cm-btn--icon" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </header>

        <form className="cm-course-search" onSubmit={(event) => void handleSubmit(event)}>
          <label className="cm-label" htmlFor="course-search">
            Course name or code
          </label>
          <div className="cm-course-search__row">
            <input
              autoFocus
              id="course-search"
              className="cm-input"
              aria-invalid={searchError !== ''}
              aria-describedby={searchError ? 'course-search-error' : undefined}
              type="text"
              value={searchText}
              onChange={(event) => {
                setSearchText(event.target.value);
                setSearchError('');
              }}
              placeholder="Example: CSE 3311"
            />
            <button type="submit" className="cm-btn cm-btn--primary" disabled={searching}>
              Search
            </button>
          </div>
          {searchError && (
            <p id="course-search-error" className="cm-field-error" role="alert">
              {searchError}
            </p>
          )}
        </form>

        {results !== null && results.length === 0 && (
          <p className="cm-search-status" role="status">
            No courses match that search. Try a code like CSE 3311 or part of the title.
          </p>
        )}

        {results !== null && results.length > 0 && (
          <ul className="cm-course-results" aria-label="Search results">
            {results.map((course) => (
              <li key={course.id} className="cm-course-results__item">
                <span className="cm-course-results__text">
                  <strong>{course.code}</strong>
                  <span className="cm-course-results__title" title={course.title}>
                    {course.title}
                  </span>
                </span>
                {course.enrolled ? (
                  <span id={`course-added-${course.id}`} className="cm-course-results__added" tabIndex={-1}>
                    <CheckIcon />
                    Added
                  </span>
                ) : (
                  <button
                    type="button"
                    className="cm-btn cm-btn--secondary cm-btn--sm"
                    disabled={addingCourseId === course.id}
                    aria-label={`Add ${course.code}`}
                    onClick={() => void handleAdd(course)}
                  >
                    Add
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {addError && (
          <div className="cm-notice cm-notice--error" role="alert">
            <AlertIcon />
            <span className="cm-notice__body">{addError}</span>
          </div>
        )}

        {addedMessage && (
          <p className="cm-search-status" role="status">
            {addedMessage}
          </p>
        )}

        <footer className="cm-dialog__footer">
          <button type="button" className="cm-btn cm-btn--secondary" onClick={onClose}>
            Done
          </button>
        </footer>
      </section>
    </div>
  );
}
