/**
 * The study group form, for creating a group and for its leader editing it.
 * Both ask the same questions under the same rules; editing starts from the
 * group's current settings, keeps its course, and will not shrink the group
 * below the members already in it.
 */
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type Course, type EnrolledCourse, type GroupDetails, type GroupFormat } from '../api';
import { MAX_CHAT_LINK_LENGTH } from '../chatLink';
import {
  DEFAULT_GROUP_SIZE,
  GROUP_FORM_FIELD_ORDER,
  MAX_GOAL_LENGTH,
  MAX_GROUP_SIZE,
  MAX_LOCATION_LENGTH,
  MAX_NAME_LENGTH,
  MEETING_DAYS,
  MIN_GROUP_SIZE,
  groupFormValuesFrom,
  minimumGroupSize,
  toCreateGroupRequest,
  toGroupSettings,
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
  name: 'group-name',
  goal: 'group-goal',
  meetingDay: 'group-day',
  meetingTime: 'group-time',
  format: 'group-format-in-person',
  location: 'group-location',
  chatLink: 'group-chat-link',
  groupSize: 'group-size',
};

type GroupFormProps = {
  /** Where Cancel goes. */
  cancelTo: string;
} & (
  | {
      mode: 'create';
      courses: EnrolledCourse[];
      /** The course the student came from. Shown fixed instead of as a choice. */
      presetCourse: EnrolledCourse | null;
    }
  | { mode: 'edit'; group: GroupDetails }
);

function emptyValues(presetCourse: Course | null): GroupFormValues {
  return {
    courseId: presetCourse?.id ?? '',
    name: '',
    goal: '',
    meetingDay: '',
    meetingTime: '',
    format: 'in_person',
    location: '',
    groupSize: String(DEFAULT_GROUP_SIZE),
    chatLink: '',
  };
}

export function GroupForm(props: GroupFormProps): ReactNode {
  const { cancelTo } = props;
  const editedGroup = props.mode === 'edit' ? props.group : null;
  const courses = props.mode === 'create' ? props.courses : [];
  const presetCourse = props.mode === 'create' ? props.presetCourse : null;
  // A group's course never changes, so editing shows it fixed like a preset one.
  const fixedCourse: Pick<Course, 'code' | 'title'> | null =
    editedGroup !== null ? { code: editedGroup.courseCode, title: editedGroup.courseTitle } : presetCourse;
  const memberCount = editedGroup?.memberCount ?? 0;
  const smallestSize = minimumGroupSize(memberCount);

  const navigate = useNavigate();
  const [values, setValues] = useState<GroupFormValues>(() =>
    editedGroup !== null ? groupFormValuesFrom(editedGroup) : emptyValues(presetCourse),
  );
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
    const next = Math.min(MAX_GROUP_SIZE, Math.max(smallestSize, start + change));
    update('groupSize', String(next));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const problems = validateGroupForm(values, memberCount);
    setErrors(problems);
    const firstProblem = GROUP_FORM_FIELD_ORDER.find((field) => problems[field] !== undefined);
    if (firstProblem !== undefined) {
      document.getElementById(FIELD_IDS[firstProblem])?.focus();
      return;
    }

    setSubmitError(null);
    setSubmitting(true);
    try {
      const { group } =
        editedGroup !== null
          ? await api.updateGroup(editedGroup.id, toGroupSettings(values))
          : await api.createGroup(toCreateGroupRequest(values));
      navigate(`/groups/${group.courseId}/${group.id}`, {
        state: editedGroup !== null ? { saved: true } : { created: true },
      });
    } catch (failure) {
      const fallback =
        editedGroup !== null
          ? 'We could not save your changes. Please try again.'
          : 'We could not create the group. Please try again.';
      setSubmitError(describeError(failure, fallback));
      setSubmitting(false);
    }
  }

  const online = values.format === 'online';
  const submitLabels =
    editedGroup !== null ? { idle: 'Save changes', busy: 'Saving…' } : { idle: 'Create group', busy: 'Creating…' };

  return (
    <form className="cm-panel cm-create-form" noValidate onSubmit={(event) => void handleSubmit(event)}>
      {fixedCourse !== null ? (
        <div className="cm-form-field">
          <span className="cm-label">Course</span>
          <p className="cm-course-chip">
            <span className="cm-code">{fixedCourse.code}</span>
            {fixedCourse.title}
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
        id={FIELD_IDS.name}
        label="Group name"
        hint={`${values.name.length}/${MAX_NAME_LENGTH} characters`}
        error={errors.name}
      >
        {(control) => (
          <input
            {...control}
            className="cm-input"
            type="text"
            value={values.name}
            onChange={(event) => update('name', event.target.value)}
            placeholder="Example: Midterm 2 crew"
            maxLength={MAX_NAME_LENGTH}
            required
          />
        )}
      </FormField>

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
        id={FIELD_IDS.chatLink}
        label="Group chat link (optional, members only)"
        hint="An invite link from GroupMe, Discord, WhatsApp or Microsoft Teams."
        error={errors.chatLink}
      >
        {(control) => (
          <input
            {...control}
            className="cm-input"
            type="url"
            value={values.chatLink}
            onChange={(event) => update('chatLink', event.target.value)}
            placeholder="https://groupme.com/join_group/…"
            maxLength={MAX_CHAT_LINK_LENGTH}
          />
        )}
      </FormField>

      <FormField
        id={FIELD_IDS.groupSize}
        label="Group size"
        hint={
          memberCount > MIN_GROUP_SIZE
            ? `Including you. At least ${memberCount}, the members already in it, up to ${MAX_GROUP_SIZE}.`
            : `Including you, from ${MIN_GROUP_SIZE} to ${MAX_GROUP_SIZE}.`
        }
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
              min={smallestSize}
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
          {submitting ? submitLabels.busy : submitLabels.idle}
        </button>
      </div>
    </form>
  );
}
