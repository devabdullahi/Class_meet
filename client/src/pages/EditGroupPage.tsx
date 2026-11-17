/**
 * The group's leader changes its name, goal, meeting time, place and size.
 * It is the Create group form, started from the group as it is now; Save
 * and Cancel both return to the group.
 */
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { ClassMeetLayout } from '../components/ClassMeetLayout';
import { GroupForm } from '../components/GroupForm';
import { AlertIcon, ChevronLeftIcon } from '../components/icons';
import { groupTitle } from '../groupFormat';
import { useApiData } from '../hooks/useApiData';

export function EditGroupPage(): ReactNode {
  const { courseId = '', groupId = '' } = useParams();
  const { data, error, notFound, loading, reload } = useApiData(
    () => api.fetchGroup(groupId),
    [groupId],
    'We could not load this group. Please try again.',
  );
  const group = data?.group ?? null;
  const groupPath = `/groups/${courseId}/${groupId}`;

  return (
    <ClassMeetLayout>
      <Link className="cm-back" to={groupPath}>
        <ChevronLeftIcon />
        Back to the group
      </Link>

      <header className="cm-pagehead">
        <div>
          <h1>Edit group</h1>
          {group !== null && <p className="cm-pagehead__sub">{groupTitle(group)}</p>}
        </div>
      </header>

      {notFound && (
        <div className="cm-empty">
          <h2>Group not found</h2>
          <p>This group may have been removed, or the link is incomplete.</p>
          <Link className="cm-btn cm-btn--secondary" to={`/groups/${courseId}`}>
            See this course&rsquo;s groups
          </Link>
        </div>
      )}

      {error !== null && !notFound && (
        <div className="cm-notice cm-notice--error" role="alert">
          <AlertIcon />
          <span className="cm-notice__body">{error}</span>
          <button type="button" className="cm-btn cm-btn--quiet cm-btn--sm" onClick={reload}>
            Try again
          </button>
        </div>
      )}

      {loading && group === null && error === null && (
        <div className="cm-create-form cm-skeleton" aria-busy="true">
          <span className="cm-sr-only">Loading the group</span>
        </div>
      )}

      {group !== null && group.viewerRole !== 'leader' && (
        <div className="cm-empty">
          <h2>Only the leader can edit this group</h2>
          <p>Ask the group&rsquo;s leader if something about it needs to change.</p>
          <Link className="cm-btn cm-btn--secondary" to={groupPath}>
            Back to the group
          </Link>
        </div>
      )}

      {group !== null && group.viewerRole === 'leader' && <GroupForm mode="edit" group={group} cancelTo={groupPath} />}
    </ClassMeetLayout>
  );
}
