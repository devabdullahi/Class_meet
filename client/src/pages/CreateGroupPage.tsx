import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, type MeetingDay } from '../api';
import { describeError, useApiData } from '../hooks/useApiData';

const MEETING_DAYS: MeetingDay[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/** A group needs its leader and at least one more student. */
const MIN_GROUP_MEMBERS = 2;

export function CreateGroupPage(): ReactNode {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: courseData, loading: coursesLoading } = useApiData(() => api.fetchMyCourses(), []);
  const courses = courseData?.courses ?? [];

  const [courseId, setCourseId] = useState(searchParams.get('course') ?? '');
  const [goal, setGoal] = useState('');
  const [location, setLocation] = useState('');
  const [meetingFormat, setMeetingFormat] = useState('in-person');
  const [meetingDay, setMeetingDay] = useState('');
  const [meetingTime, setMeetingTime] = useState('');
  const [sizeCap, setSizeCap] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!goal.trim() || !location.trim()) {
      setError('Enter a study goal and meeting location.');
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      const { group } = await api.createGroup({
        courseId,
        goal: goal.trim(),
        meetingDay: meetingDay as MeetingDay,
        meetingTime,
        format: meetingFormat === 'online' ? 'online' : 'in_person',
        location: location.trim(),
        maxMembers: Number(sizeCap),
      });
      navigate(`/groups/${group.courseId}/${group.id}`, { state: { created: true } });
    } catch (failure) {
      setError(describeError(failure));
      setSubmitting(false);
    }
  }

  return (
    <main className="page">
      <Link className="button create-group-back" to="/">← Back</Link>
      <section className="panel" aria-labelledby="create-group-title">
        <div className="panel__header">
          <h1 className="panel__title" id="create-group-title">
            Create Group
          </h1>
        </div>
        <div className="panel__body">
          <p>Set up a study group for your course.</p>
          <form
            className="create-group-form"
            onSubmit={(event) => void handleSubmit(event)}
            onChange={() => setError('')}
          >
            <label htmlFor="group-course">Course</label>
            <select
              id="group-course"
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
              disabled={courses.length === 0}
              aria-describedby="group-course-help"
              required
            >
              <option value="">
                {coursesLoading ? 'Loading courses…' : courses.length === 0 ? 'No courses yet' : 'Select a course'}
              </option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.code} — {course.title}
                </option>
              ))}
            </select>
            <p id="group-course-help" className="panel__hint">
              {!coursesLoading && courses.length === 0 ? (
                <>
                  You have no courses yet. Add one on the <Link to="/">My Courses</Link> page first.
                </>
              ) : (
                'All details below are required.'
              )}
            </p>

            <label htmlFor="group-day">Meeting day</label>
            <select
              id="group-day"
              value={meetingDay}
              onChange={(event) => setMeetingDay(event.target.value)}
              required
            >
              <option value="">Select a day</option>
              {MEETING_DAYS.map((day) => (
                <option key={day} value={day}>{day}</option>
              ))}
            </select>

            <label htmlFor="group-time">Meeting time (local time)</label>
            <input
              id="group-time"
              type="time"
              value={meetingTime}
              onChange={(event) => setMeetingTime(event.target.value)}
              required
            />

            <label htmlFor="group-size">Maximum members</label>
            <input
              id="group-size"
              type="number"
              min={MIN_GROUP_MEMBERS}
              max={50}
              step={1}
              value={sizeCap}
              onChange={(event) => setSizeCap(event.target.value)}
              required
            />
            <label htmlFor="group-goal">Study goal</label>
            <textarea
              id="group-goal"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder="Example: Review for the next exam"
              rows={3}
              maxLength={500}
              required
            />
            <label htmlFor="group-format">Meeting format</label>
            <select
              id="group-format"
              value={meetingFormat}
              onChange={(event) => {
                setMeetingFormat(event.target.value);
                setLocation('');
              }}
            >
              <option value="in-person">In person</option>
              <option value="online">Online</option>
            </select>
            <label htmlFor="group-location">
              {meetingFormat === 'online' ? 'Meeting link' : 'Meeting location'}
            </label>
            <input
              id="group-location"
              type={meetingFormat === 'online' ? 'url' : 'text'}
              aria-describedby={meetingFormat === 'online' ? 'group-link-help' : undefined}
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder={meetingFormat === 'online'
                ? 'Example: https://teams.microsoft.com/...'
                : 'Example: Central Library, second floor'}
              required
            />
            {meetingFormat === 'online' && (
              <p id="group-link-help" className="panel__hint">
                Create a meeting in Teams, Zoom, or Google Meet, then paste its invite link here.
              </p>
            )}
            {error && <p className="alert alert--error" role="alert">{error}</p>}
            <div className="create-group-form__actions">
              <Link className="button" to="/">Cancel</Link>
              <button className="button" type="submit" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create Group'}
              </button>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
