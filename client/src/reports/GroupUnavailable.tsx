import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { ChevronLeftIcon } from '../components/icons';
import { useApiData } from '../hooks/useApiData';
import { shortDate } from './reportWording';

interface GroupUnavailableProps {
  groupId: string;
  /** The course in the address, for the way back when nothing more is known. */
  courseId: string;
}

/**
 * What Group Details shows for a group that does not exist. A group a
 * moderator removed left a record behind, so its old link (in a classmate's
 * message, or the browser history) explains what happened instead of
 * looking broken. Anything else, or a record that cannot be loaded, is the
 * ordinary "not found".
 */
export function GroupUnavailable({ groupId, courseId }: GroupUnavailableProps): ReactNode {
  const { data, loading } = useApiData(() => api.fetchGroupRemoval(groupId), [groupId]);
  const removal = data?.removal ?? null;

  // Brief, and usually nothing: rather than flash "not found" before the
  // explanation, show the page empty until the answer arrives.
  if (loading && removal === null) {
    return <span className="cm-sr-only">Loading group</span>;
  }

  if (removal !== null) {
    const courseGroups = `/groups/${removal.courseId}`;
    return (
      <>
        <Link className="cm-back" to={courseGroups}>
          <ChevronLeftIcon />
          Back to {removal.courseCode} groups
        </Link>
        <div className="cm-empty">
          <h2>This group was removed</h2>
          <p>
            A moderator removed &ldquo;{removal.title}&rdquo; on {shortDate(removal.removedAt)} because it broke
            Class Meet&rsquo;s community rules. Thanks to the students who reported it.
          </p>
          <Link className="cm-btn cm-btn--secondary" to={courseGroups}>
            See other {removal.courseCode} groups
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <Link className="cm-back" to={`/groups/${courseId}`}>
        <ChevronLeftIcon />
        Back to study groups
      </Link>
      <div className="cm-empty">
        <h2>Group not found</h2>
        <p>This group may have been removed, or the link is incomplete.</p>
        <Link className="cm-btn cm-btn--secondary" to={`/groups/${courseId}`}>
          See this course&rsquo;s groups
        </Link>
      </div>
    </>
  );
}
