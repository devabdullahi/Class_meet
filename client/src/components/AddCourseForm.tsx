import { useState, type FormEvent, type ReactNode } from 'react';
import { api, type CourseSearchResult } from '../api';
import { describeError } from '../hooks/useApiData';

interface AddCourseFormProps {
  onClose: () => void;
  /** Called after a course is added, so the page behind the dialog can refresh. */
  onAdded?: () => void;
}

export function AddCourseForm({
  onClose,
  onAdded,
}: AddCourseFormProps): ReactNode {
  const [searchText, setSearchText] = useState('');
  const [error, setError] = useState('');
  const [results, setResults] = useState<CourseSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [addingCourseId, setAddingCourseId] = useState<string | null>(null);
  const [addedMessage, setAddedMessage] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!searchText.trim()) {
      setError('Enter a course name or course code.');
      return;
    }

    setError('');
    setAddedMessage('');
    setSearching(true);
    try {
      const reply = await api.searchCourses(searchText.trim());
      setResults(reply.courses);
    } catch (failure) {
      setResults(null);
      setError(describeError(failure));
    } finally {
      setSearching(false);
    }
  }

  async function handleAdd(course: CourseSearchResult): Promise<void> {
    setError('');
    setAddingCourseId(course.id);
    try {
      await api.enrollInCourse(course.id);
      setResults((current) =>
        current === null
          ? current
          : current.map((item) => (item.id === course.id ? { ...item, enrolled: true } : item)),
      );
      setAddedMessage(`${course.code} was added to your courses.`);
      onAdded?.();
    } catch (failure) {
      setError(describeError(failure));
    } finally {
      setAddingCourseId(null);
    }
  }

  return (
    <div className="modal-backdrop">
      <section
        className="modal"
        role="dialog"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
            return;
          }

          if (event.key === 'Tab') {
            const controls = event.currentTarget.querySelectorAll<HTMLElement>(
              'button:not(:disabled), input:not(:disabled)',
            );
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
        }}
        aria-modal="true"
        aria-labelledby="add-course-title"
      >
        <header className="modal__header">
          <h2 id="add-course-title">Add Course</h2>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Add Course"
          >
            ×
          </button>
        </header>

        <form onSubmit={(event) => void handleSubmit(event)}>
          <label htmlFor="course-search">
            Course name or code
          </label>

          <input
            autoFocus
            id="course-search"
            aria-invalid={error !== ''}
            aria-describedby={error ? 'course-search-error' : undefined}
            type="text"
            value={searchText}
            onChange={(event) => {
              setSearchText(event.target.value);
              setError('');
            }}
            placeholder="Example: CSE 3311"
          />

          {error && (
            <p id="course-search-error" className="alert alert--error" role="alert">
              {error}
            </p>
          )}

          {results !== null && results.length === 0 && (
            <p className="course-search-status" role="status">
              No courses match that search. Try a code like CSE 3311 or part of the title.
            </p>
          )}

          {results !== null && results.length > 0 && (
            <ul className="course-results" aria-label="Search results">
              {results.map((course) => (
                <li key={course.id} className="course-results__item">
                  <span>
                    <strong>{course.code}</strong> &mdash; {course.title}
                  </span>
                  <button
                    type="button"
                    className="button"
                    disabled={course.enrolled || addingCourseId === course.id}
                    aria-label={course.enrolled ? `${course.code} already added` : `Add ${course.code}`}
                    onClick={() => void handleAdd(course)}
                  >
                    {course.enrolled ? 'Added' : 'Add'}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {addedMessage && <p className="course-search-status" role="status">{addedMessage}</p>}

          <footer className="modal__footer">
            <button type="button" className="button" onClick={onClose}>
              Cancel
            </button>

            <button type="submit" className="button" disabled={searching}>
              Search
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
