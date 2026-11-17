import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type EnrolledCourse, type GroupFormat } from '../api';
import {
  DEFAULT_GROUP_SIZE,
  GROUP_FORM_FIELD_ORDER,
  MAX_GOAL_LENGTH,
  MAX_GROUP_SIZE,
  MAX_LOCATION_LENGTH,
  MEETING_DAYS,
  MIN_GROUP_SIZE,
  toCreateGroupRequest,
  validateGroupForm,
  type GroupFormErrors,
  type GroupFormField,
  type GroupFormValues,
} from '../groupForm';
import { describeError } from '../hooks/useApiData';
import { FormField } from './FormField';
import { AlertIcon, MinusIcon, PlusIcon } from './icons';

/** The DOM id of each field's control, so focus can move to the first problem. */
const FIELD_IDS: Record<GroupFormField, string> = {
  courseId: 'group-course',
  goal: 'group-goal',
  meetingDay: 'group-day',
  meetingTime: 'group-time',
  format: 'group-format-in-person',
  location: 'group-location',
  groupSize: 'group-size',
};

interface CreateGroupFormProps {
  courses: EnrolledCourse[];
  /** The course the student came from. Shown fixed instead of as a choice. */
  presetCourse: EnrolledCourse | null;
  /** Where Cancel goes. */
  cancelTo: string;
}

export function CreateGroupForm({ courses, presetCourse, cancelTo }: CreateGroupFormProps): ReactNode {
  const navigate = useNavigate();
  const [values, setValues] = useState<GroupFormValues>({
    courseId: presetCourse?.id ?? '',
    goal: '',
    meetingDay: '',
    meetingTime: '',
    format: 'in_person',
    location: '',
    groupSize: String(DEFAULT_GROUP_SIZE),
  });
  const [errors, setErrors] = useState<GroupFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<Field extends GroupFormField>(field: Field, value: GroupFormValues[Field]): void {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setSubmitError(null);
  }

  function changeFormat(format: GroupFormat): void {
    // A place is not a link and a link is not a place, so switching starts over.
    setValues((current) => ({ ...current, format, location: '' }));
    setErrors((current) => ({ ...current, location: undefined }));
  }

  function stepGroupSize(change: number): void {
    const current = Number(values.groupSize);
    const start = Number.isInteger(current) ? current : DEFAULT_GROUP_SIZE;
    const next = Math.min(MAX_GROUP_SIZE, Math.max(MIN_GROUP_SIZE, start + change));
    update('groupSize', String(next));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const problems = validateGroupForm(values);
    setErrors(problems);
    const firstProblem = GROUP_FORM_FIELD_ORDER.find((field) => problems[field] !== undefined);
    if (firstProblem !== undefined) {
      document.getElementById(FIELD_IDS[firstProblem])?.focus();
      return;
    }

    setSubmitError(null);
    setSubmitting(true);
    try {
      const { group } = await api.createGroup(toCreateGroupRequest(values));
      navigate(`/groups/${group.courseId}/${group.id}`, { state: { created: true } });
    } catch (failure) {
      setSubmitError(describeError(failure, 'We could not create the group. Please try again.'));
      setSubmitting(false);
    }
  }

  const online = values.format === 'online';

  return (
    <form className="cm-panel cm-create-form" noValidate onSubmit={(event) => void handleSubmit(event)}>
      {presetCourse !== null ? (
        <div className="cm-form-field">
          <span className="cm-label">Course</span>
          <p className="cm-course-chip">
            <span className="cm-code">{presetCourse.code}</span>
            {presetCourse.title}
          </p>
        </div>
      ) : (
        <FormField id={FIELD_IDS.courseId} label="Course" error={errors.courseId}>
          {(control) => (
            <select
              {...control}
              className="cm-input"
              value={values.courseId}
              onChange={(event) => update('courseId', event.target.value)}
              required
            >
              <option value="">Select a course</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.code} — {course.title}
                </option>
              ))}
            </select>
          )}
        </FormField>
      )}

      <FormField
        id={FIELD_IDS.goal}
        label="What will you study?"
        hint={`${values.goal.length}/${MAX_GOAL_LENGTH} characters`}
        error={errors.goal}
      >
        {(control) => (
          <textarea
            {...control}
            className="cm-input"
            value={values.goal}
            onChange={(event) => update('goal', event.target.value)}
            placeholder="Example: Review chapters 4 to 6 for exam 2"
            rows={3}
            maxLength={MAX_GOAL_LENGTH}
            required
          />
        )}
      </FormField>

      <div className="cm-form-row">
        <FormField id={FIELD_IDS.meetingDay} label="Day" error={errors.meetingDay}>
          {(control) => (
            <select
              {...control}
              className="cm-input"
              value={values.meetingDay}
              onChange={(event) => update('meetingDay', event.target.value as GroupFormValues['meetingDay'])}
              required
            >
              <option value="">Choose a day</option>
              {MEETING_DAYS.map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
          )}
        </FormField>

        <FormField id={FIELD_IDS.meetingTime} label="Time" hint="Your local time" error={errors.meetingTime}>
          {(control) => (
            <input
              {...control}
              className="cm-input"
              type="time"
              value={values.meetingTime}
              onChange={(event) => update('meetingTime', event.target.value)}
              required
            />
          )}
        </FormField>

        <fieldset className="cm-form-field">
          <legend className="cm-label">Format</legend>
          <div className="cm-segmented">
            <label>
              <input
                type="radio"
                id={FIELD_IDS.format}
                name="group-format"
                checked={!online}
                onChange={() => changeFormat('in_person')}
              />
              <span>In person</span>
            </label>
            <label>
              <input type="radio" name="group-format" checked={online} onChange={() => changeFormat('online')} />
              <span>Online</span>
            </label>
          </div>
        </fieldset>
      </div>

      <FormField
        id={FIELD_IDS.location}
        label={online ? 'Meeting link' : 'Meeting place'}
        hint={
          online
            ? 'Create a meeting in Teams, Zoom or Google Meet, then paste its invite link here.'
            : undefined
        }
        error={errors.location}
      >
        {(control) => (
          <input
            {...control}
            className="cm-input"
            type={online ? 'url' : 'text'}
            value={values.location}
            onChange={(event) => update('location', event.target.value)}
            placeholder={online ? 'https://teams.microsoft.com/…' : 'Example: Central Library, second floor'}
            maxLength={MAX_LOCATION_LENGTH}
            required
          />
        )}
      </FormField>

      <FormField
        id={FIELD_IDS.groupSize}
        label="Group size"
        hint={`Including you, from ${MIN_GROUP_SIZE} to ${MAX_GROUP_SIZE}.`}
        error={errors.groupSize}
      >
        {(control) => (
          <div className="cm-stepper">
            <button
              type="button"
              className="cm-btn cm-btn--icon"
              aria-label="Fewer people"
              onClick={() => stepGroupSize(-1)}
            >
              <MinusIcon />
            </button>
            <input
              {...control}
              className="cm-input"
              type="number"
              inputMode="numeric"
              min={MIN_GROUP_SIZE}
              max={MAX_GROUP_SIZE}
              step={1}
              value={values.groupSize}
              onChange={(event) => update('groupSize', event.target.value)}
              required
            />
            <button
              type="button"
              className="cm-btn cm-btn--icon"
              aria-label="More people"
              onClick={() => stepGroupSize(1)}
            >
              <PlusIcon />
            </button>
          </div>
        )}
      </FormField>

      {submitError !== null && (
        <div className="cm-notice cm-notice--error" role="alert">
          <AlertIcon />
          <span className="cm-notice__body">{submitError}</span>
        </div>
      )}

      <div className="cm-form__actions">
        <Link className="cm-btn cm-btn--quiet" to={cancelTo}>
          Cancel
        </Link>
        <button className="cm-btn cm-btn--primary cm-form__submit" type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create group'}
        </button>
      </div>
    </form>
  );
}
