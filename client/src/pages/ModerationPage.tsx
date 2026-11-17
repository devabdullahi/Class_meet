/**
 * Reports, for moderators: the groups and members students reported, most
 * reported first, each with the decision to make (Resolve keeps it, Remove
 * takes it down); and the decisions already made.
 *
 * Anyone may open the address, but the server answers 403 to a student who
 * is not a moderator, and the page shows that answer.
 */
import { useCallback, useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, type ModerationReports, type OpenReportTarget, type ResolvedReportTarget } from '../api';
import { useAuth } from '../auth/useAuth';
import { ClassMeetLayout } from '../components/ClassMeetLayout';
import { AlertIcon, CheckCircleIcon } from '../components/icons';
import { InlineConfirm } from '../components/InlineConfirm';
import { describeError, useApiData } from '../hooks/useApiData';
import { useModerationStatus } from '../moderation/useModerationStatus';
import { countOf, REPORT_OUTCOME_LABELS, reportReasonLabel, shortDate } from '../reports/reportWording';

type View = 'open' | 'resolved';

/** The heading of a queue row: the member when one was reported, else the group. */
function targetName(target: OpenReportTarget): string {
  return target.member?.name ?? target.groupTitle;
}

function targetMeta(target: OpenReportTarget): string {
  const { member } = target;
  if (member === null) {
    return `Group in ${target.courseCode} · Leader: ${target.leaderName} · ${countOf(target.memberCount, 'member', 'members')}`;
  }
  if (member.isLeader) return `Leader of ${target.groupTitle} · ${target.courseCode}`;
  if (!member.inGroup) return `No longer in ${target.groupTitle} · ${target.courseCode}`;
  return `Member of ${target.groupTitle} · ${target.courseCode}`;
}

function quoteLine(target: OpenReportTarget): string {
  const { details, reporterName, reportedAt } = target.latestReport;
  const byline = `${reporterName}, ${shortDate(reportedAt)}`;
  return details === null ? `Reported by ${byline}` : `“${details}” ${byline}`;
}

interface QueueRowProps {
  target: OpenReportTarget;
  /** Called after a decision, with what to tell the moderator. */
  onDecided: (message: string) => void;
}

function QueueRow({ target, onDecided }: QueueRowProps): ReactNode {
  const [keeping, setKeeping] = useState(false);
  const [keepError, setKeepError] = useState<string | null>(null);
  const titleId = useId();
  const { member, groupTitle } = target;
  const name = targetName(target);

  async function keep(): Promise<void> {
    setKeepError(null);
    setKeeping(true);
    try {
      await api.keepReported(target.groupId, member?.userId ?? null);
      onDecided(
        `Resolved the reports about ${member === null ? `“${groupTitle}”` : name}. Nothing was changed.`,
      );
    } catch (failure) {
      setKeepError(describeError(failure, 'We could not resolve these reports. Please try again.'));
      setKeeping(false);
    }
  }

  // A leader cannot be taken out of their own group, so acting on a leader
  // means taking the group down; a member who already left has nothing to
  // be removed from, and Resolve is the only decision left.
  const removesGroup = member === null || member.isLeader;
  const canRemove = removesGroup || member.inGroup;

  return (
    <article className="cm-panel cm-report" aria-labelledby={titleId}>
      <div className="cm-report__count">
        <strong>{target.reportCount}</strong>
        <span>{target.reportCount === 1 ? 'report' : 'reports'}</span>
      </div>
      <div className="cm-report__body">
        <h2 id={titleId} className="cm-report__title">
          {name}
        </h2>
        <p className="cm-report__meta">{targetMeta(target)}</p>
        <p className="cm-report__reason">{reportReasonLabel(target.latestReport.reason)}</p>
        <p className="cm-report__quote">{quoteLine(target)}</p>
        {keepError !== null && (
          <p className="cm-field-error" role="alert">
            {keepError}
          </p>
        )}
      </div>
      <div className="cm-report__actions">
        <button
          type="button"
          className="cm-btn cm-btn--secondary cm-btn--sm"
          aria-label={`Resolve the reports about ${name}`}
          disabled={keeping}
          onClick={() => void keep()}
        >
          {keeping ? 'Resolving…' : 'Resolve'}
        </button>
        {canRemove &&
          (removesGroup ? (
            <InlineConfirm
              label="Remove group"
              busyLabel="Removing…"
              ariaLabel={`Remove the group ${groupTitle}`}
              question={`Remove “${groupTitle}”?`}
              consequence={
                `It disappears from ${target.courseCode} for everyone and its ` +
                `${countOf(target.memberCount, 'member loses', 'members lose')} access. ` +
                'Anyone who opens its link is told a moderator removed it. This can’t be undone.'
              }
              failureMessage="We could not remove the group. Please try again."
              onConfirm={async () => {
                await api.removeReportedGroup(target.groupId);
                onDecided(`Removed “${groupTitle}”. Anyone who opens its link is told a moderator removed it.`);
              }}
            />
          ) : (
            <InlineConfirm
              label="Remove from group"
              busyLabel="Removing…"
              ariaLabel={`Remove ${name} from ${groupTitle}`}
              question={`Remove ${name} from “${groupTitle}”?`}
              consequence={`${name} loses their seat in the group and its meeting link. The group itself stays.`}
              failureMessage="We could not remove this member. Please try again."
              onConfirm={async () => {
                await api.removeReportedMember(target.groupId, member.userId);
                onDecided(`Removed ${name} from “${groupTitle}”.`);
              }}
            />
          ))}
        <Link to={`/groups/${target.courseId}/${target.groupId}`} aria-label={`View the group ${groupTitle}`}>
          View group
        </Link>
      </div>
    </article>
  );
}

const OUTCOME_DETAILS: Record<ResolvedReportTarget['outcome'], (isMember: boolean) => string> = {
  kept: (isMember) => (isMember ? 'Stayed in the group' : 'Left as it was'),
  removed: (isMember) => (isMember ? 'Their group was taken down' : 'Group taken down'),
  removed_from_group: () => 'Taken out of the group',
};

function ResolvedRow({ decision, viewerId }: { decision: ResolvedReportTarget; viewerId: string | undefined }): ReactNode {
  const isMember = decision.memberName !== null;
  // A group its leader deleted after the decision has no name left to show.
  const groupName = decision.groupTitle ?? 'a deleted group';
  let where = `Member of ${groupName}`;
  if (!isMember) where = decision.courseCode === null ? 'Group' : `Group in ${decision.courseCode}`;

  return (
    <tr role="row">
      <td role="cell">
        {decision.memberName ?? decision.groupTitle ?? 'A deleted group'}
        <span className="cm-report__meta">
          {where} · {countOf(decision.reportCount, 'report', 'reports')}
        </span>
      </td>
      <td role="cell">{reportReasonLabel(decision.reason)}</td>
      <td role="cell">
        <strong>{REPORT_OUTCOME_LABELS[decision.outcome]}</strong>
        <span className="cm-report__meta">{OUTCOME_DETAILS[decision.outcome](isMember)}</span>
      </td>
      <td role="cell" className="cm-resolved__date">
        {shortDate(decision.resolvedAt)} · {decision.resolvedById === viewerId ? 'you' : decision.resolvedByName}
      </td>
    </tr>
  );
}

/** A 403 is the server's answer for a student who is not a moderator, not a failure to retry. */
async function loadReports(): Promise<ModerationReports | 'not_moderator'> {
  try {
    return await api.fetchModerationReports();
  } catch (failure) {
    if (failure instanceof ApiError && failure.status === 403) return 'not_moderator';
    throw failure;
  }
}

export function ModerationPage(): ReactNode {
  const { user } = useAuth();
  const { refresh: refreshModerationStatus } = useModerationStatus();
  const {
    data: result,
    error,
    loading,
    reload,
  } = useApiData(loadReports, [], 'We could not load the reports. Please try again.');
  const notModerator = result === 'not_moderator';
  const data = notModerator ? null : result;
  const [view, setView] = useState<View>('open');
  const [decision, setDecision] = useState<string | null>(null);

  // The row the moderator acted on is gone, so the notice saying what
  // happened takes focus.
  const decisionNotice = useCallback((notice: HTMLDivElement | null) => notice?.focus(), []);

  function handleDecided(message: string): void {
    setDecision(message);
    reload();
    refreshModerationStatus();
  }

  return (
    <ClassMeetLayout>
      <header className="cm-pagehead">
        <div>
          <h1>Reports</h1>
          {!notModerator && (
            <p className="cm-pagehead__sub">
              Most reported first. Resolve keeps the group as it is; Remove takes it down for everyone.
            </p>
          )}
        </div>
      </header>

      {notModerator && (
        <div className="cm-empty">
          <h2>Reports are for moderators</h2>
          <p>Moderators review the groups and members students report. Your account is not a moderator.</p>
          <Link className="cm-btn cm-btn--secondary" to="/">
            Go to My courses
          </Link>
        </div>
      )}

      {error !== null && (
        <div className="cm-notice cm-notice--error" role="alert">
          <AlertIcon />
          <span className="cm-notice__body">{error}</span>
          <button type="button" className="cm-btn cm-btn--quiet cm-btn--sm" onClick={reload}>
            Try again
          </button>
        </div>
      )}

      {loading && result === null && error === null && (
        <div aria-busy="true">
          <span className="cm-sr-only">Loading reports</span>
          <div className="cm-skeleton cm-reports-skeleton" />
        </div>
      )}

      {data !== null && (
        <>
          <fieldset className="cm-form-field cm-reports-view">
            <legend className="cm-sr-only">Show</legend>
            <div className="cm-segmented">
              <label>
                <input
                  type="radio"
                  name="reports-view"
                  checked={view === 'open'}
                  onChange={() => setView('open')}
                />
                <span>Open · {data.open.length}</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="reports-view"
                  checked={view === 'resolved'}
                  onChange={() => setView('resolved')}
                />
                <span>Resolved · {data.resolvedCount}</span>
              </label>
            </div>
          </fieldset>

          {decision !== null && (
            <div key={decision} ref={decisionNotice} className="cm-notice" role="status" tabIndex={-1}>
              <CheckCircleIcon />
              <span className="cm-notice__body">{decision}</span>
            </div>
          )}

          {view === 'open' &&
            (data.open.length === 0 ? (
              <div className="cm-empty">
                <h2>No open reports</h2>
                <p>When students report a group or a member, it shows up here, most reported first.</p>
              </div>
            ) : (
              <div className="cm-report-list">
                {data.open.map((target) => (
                  <QueueRow
                    key={`${target.groupId}:${target.member?.userId ?? 'group'}`}
                    target={target}
                    onDecided={handleDecided}
                  />
                ))}
              </div>
            ))}

          {view === 'resolved' &&
            (data.resolved.length === 0 ? (
              <div className="cm-empty">
                <h2>No resolved reports yet</h2>
                <p>Each decision you or another moderator makes is listed here, newest first.</p>
              </div>
            ) : (
              <>
                {/* The roles restate the table's own: on a phone the rows are
                    restyled as stacks, which makes some browsers stop
                    announcing it as a table unless the roles are explicit. */}
                <table className="cm-resolved" role="table">
                  <thead role="rowgroup">
                    <tr role="row">
                      <th scope="col" role="columnheader">Reported</th>
                      <th scope="col" role="columnheader">Reason</th>
                      <th scope="col" role="columnheader">Outcome</th>
                      <th scope="col" role="columnheader">Resolved</th>
                    </tr>
                  </thead>
                  <tbody role="rowgroup">
                    {data.resolved.map((row) => (
                      <ResolvedRow
                        key={`${row.groupId}:${row.memberName ?? 'group'}:${row.resolvedAt}`}
                        decision={row}
                        viewerId={user?.id}
                      />
                    ))}
                  </tbody>
                </table>
                {data.resolved.length < data.resolvedCount && (
                  <p className="cm-hint cm-resolved__more">
                    Showing the {data.resolved.length} most recent of {data.resolvedCount}.
                  </p>
                )}
              </>
            ))}
        </>
      )}
    </ClassMeetLayout>
  );
}
