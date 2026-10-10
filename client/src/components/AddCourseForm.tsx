import { useState, type FormEvent, type ReactNode } from 'react';

interface AddCourseFormProps {
  onClose: () => void;
}

export function AddCourseForm({
  onClose,
}: AddCourseFormProps): ReactNode {
  const [searchText, setSearchText] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!searchText.trim()) {
      setError('Enter a course name or course code.');
      return;
    }

    setError('');
    console.log('Searching for:', searchText);
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

        <form onSubmit={handleSubmit}>
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

          <footer className="modal__footer">
            <button type="button" className="button" onClick={onClose}>
              Cancel
            </button>

            <button type="submit" className="button">
              Search
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
