import type { ReactNode } from 'react';

/** The props a form control needs so its label, hint and error are announced with it. */
export interface FieldControlProps {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby'?: string;
}

interface FormFieldProps {
  id: string;
  label: string;
  /** Shown under the control unless there is an error, which takes its place. */
  hint?: ReactNode;
  error?: string;
  children: (control: FieldControlProps) => ReactNode;
}

/**
 * Label, control, then hint or error, with the control wired to whichever
 * message is showing. The control is passed in as a function so each field
 * keeps its own element (input, select, textarea) and its own props.
 */
export function FormField({ id, label, hint, error, children }: FormFieldProps): ReactNode {
  const messageId = `${id}-message`;
  const message = error ?? hint;
  return (
    <div className="cm-form-field">
      <label className="cm-label" htmlFor={id}>
        {label}
      </label>
      {children({
        id,
        'aria-invalid': error !== undefined,
        'aria-describedby': message === undefined ? undefined : messageId,
      })}
      {error !== undefined ? (
        <p id={messageId} className="cm-field-error">
          {error}
        </p>
      ) : (
        hint !== undefined && (
          <p id={messageId} className="cm-hint">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
