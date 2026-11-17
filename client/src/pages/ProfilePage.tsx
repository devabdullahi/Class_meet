/**
 * The student's own profile, beside a preview of exactly what a group leader
 * sees on their join request. Every field is optional. Opened from a group's
 * "Add a profile" note, saving (or cancelling) returns to that group so the
 * student can go on and ask to join.
 */
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, type MeetingPreference, type StudentProfile, type StudentYear, type StudyStyle } from '../api';
import { useAuth } from '../auth/useAuth';
import { ClassMeetLayout } from '../components/ClassMeetLayout';
import { AlertIcon, CheckCircleIcon, CheckIcon } from '../components/icons';
import { RequesterProfile } from '../components/RequesterProfile';
import { describeError, useApiData } from '../hooks/useApiData';
import {
  EMPTY_PROFILE,
  MAX_MAJOR_LENGTH,
  MAX_STUDY_STYLES,
  MEETING_PREFERENCES,
  STUDENT_YEARS,
  STUDY_STYLES,
} from '../profile';

/**
 * Where to go after saving: the group the student came from. Only a group
 * page inside the app is accepted, whatever the history entry says.
 */
function returnPathFrom(state: unknown): string | null {
  const returnTo = typeof state === 'object' && state !== null ? (state as Record<string, unknown>)['returnTo'] : null;
  return typeof returnTo === 'string' && returnTo.startsWith('/groups/') ? returnTo : null;
}

interface ProfileFormProps {
  saved: StudentProfile;
  studentName: string;
  returnTo: string | null;
}

function ProfileForm({ saved, studentName, returnTo }: ProfileFormProps): ReactNode {
  const navigate = useNavigate();
  const [major, setMajor] = useState(saved.major ?? '');
  const [year, setYear] = useState<StudentYear | null>(saved.year);
  const [meetingPreference, setMeetingPreference] = useState<MeetingPreference | null>(saved.meetingPreference);
  const [studyStyles, setStudyStyles] = useState<StudyStyle[]>(saved.studyStyles);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const draft: StudentProfile = {
    major: major.trim() === '' ? null : major.trim(),
    year,
    meetingPreference,
    studyStyles,
  };

  /** Any change makes "Profile saved." out of date. */
  function changed(): void {
    setJustSaved(false);
    setSaveError(null);
  }

  function toggleStudyStyle(style: StudyStyle, chosen: boolean): void {
    setStudyStyles((current) =>
      chosen ? [...current, style] : current.filter((existing) => existing !== style),
    );
    changed();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaveError(null);
    setSaving(true);
    try {
      await api.saveProfile(draft);
    } catch (failure) {
      setSaveError(describeError(failure, 'We could not save your profile. Please try again.'));
      setSaving(false);
      return;
    }
    if (returnTo !== null) {
      navigate(returnTo);
      return;
    }
    setSaving(false);
    setJustSaved(true);
  }

  const atStyleLimit = studyStyles.length >= MAX_STUDY_STYLES;

  return (
    <div className="cm-profile-layout">
      <form className="cm-panel cm-create-form" noValidate onSubmit={(event) => void handleSubmit(event)}>
        <div className="cm-form-field">
          <label className="cm-label" htmlFor="profile-major">
            Major
          </label>
          <input
            id="profile-major"
            className="cm-input"
            type="text"
            value={major}
            onChange={(event) => {
              setMajor(event.target.value);
              changed();
            }}
            placeholder="Example: Computer Science"
            maxLength={MAX_MAJOR_LENGTH}
          />
        </div>

        <div className="cm-form-row cm-profile-row">
          <div className="cm-form-field">
            <label className="cm-label" htmlFor="profile-year">
              Year
            </label>
            <select
              id="profile-year"
              className="cm-input"
              value={year ?? ''}
              onChange={(event) => {
                setYear(event.target.value === '' ? null : (event.target.value as StudentYear));
                changed();
              }}
            >
              <option value="">Not set</option>
              {STUDENT_YEARS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="cm-form-field">
            <legend className="cm-label">Where you can meet</legend>
            <div className="cm-segmented">
              {MEETING_PREFERENCES.map((option) => (
                <label key={option.value}>
                  <input
                    type="radio"
                    name="profile-meeting"
                    value={option.value}
                    checked={meetingPreference === option.value}
                    onChange={() => {
                      setMeetingPreference(option.value);
                      changed();
                    }}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <fieldset className="cm-form-field" aria-describedby="profile-styles-hint">
          <legend className="cm-label">How you like to study</legend>
          <div className="cm-chips">
            {STUDY_STYLES.map((style) => {
              const chosen = studyStyles.includes(style.value);
              return (
                <label key={style.value} className="cm-chip">
                  <input
                    type="checkbox"
                    checked={chosen}
                    disabled={!chosen && atStyleLimit}
                    onChange={(event) => toggleStudyStyle(style.value, event.target.checked)}
                  />
                  <span>
                    {chosen && <CheckIcon />}
                    {style.label}
                  </span>
                </label>
              );
            })}
          </div>
          <p id="profile-styles-hint" className="cm-hint">
            Pick up to two.
          </p>
        </fieldset>

        {saveError !== null && (
          <div className="cm-notice cm-notice--error" role="alert">
            <AlertIcon />
            <span className="cm-notice__body">{saveError}</span>
          </div>
        )}
        {justSaved && (
          <div className="cm-notice" role="status">
            <CheckCircleIcon />
            <span className="cm-notice__body">
              Profile saved. Leaders of groups you ask to join will see it with your request.
            </span>
          </div>
        )}

        <div className="cm-form__actions">
          <Link className="cm-btn cm-btn--quiet" to={returnTo ?? '/'}>
            Cancel
          </Link>
          <button className="cm-btn cm-btn--primary cm-form__submit" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>

      <aside className="cm-panel cm-profile-preview" aria-labelledby="profile-preview-heading">
        <h2 id="profile-preview-heading">What leaders see</h2>
        <ul className="cm-requests">
          <li className="cm-request">
            <RequesterProfile name={studentName} profile={draft} />
          </li>
        </ul>
        <p className="cm-hint">
          Only leaders of groups you ask to join see it. Your email and your other courses are not shown.
        </p>
      </aside>
    </div>
  );
}

export function ProfilePage(): ReactNode {
  const { user } = useAuth();
  const { state } = useLocation();
  const { data, error, loading, reload } = useApiData(
    () => api.fetchProfile(),
    [],
    'We could not load your profile. Please try again.',
  );

  return (
    <ClassMeetLayout>
      <header className="cm-pagehead">
        <div>
          <h1>Your profile</h1>
          <p className="cm-pagehead__sub">
            Group leaders see this beside your join request, so they know who is asking. Every field is optional.
          </p>
        </div>
      </header>

      {error !== null && (
        <div className="cm-notice cm-notice--error" role="alert">
          <AlertIcon />
          <span className="cm-notice__body">{error}</span>
          <button type="button" className="cm-btn cm-btn--quiet cm-btn--sm" onClick={reload}>
            Try again
          </button>
        </div>
      )}

      {loading && data === null && error === null && (
        <div className="cm-create-form cm-skeleton" aria-busy="true">
          <span className="cm-sr-only">Loading your profile</span>
        </div>
      )}

      {data !== null && (
        <ProfileForm
          saved={data.profile ?? EMPTY_PROFILE}
          studentName={user?.name ?? ''}
          returnTo={returnPathFrom(state)}
        />
      )}
    </ClassMeetLayout>
  );
}
