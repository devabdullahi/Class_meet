/**
 * Reporting from Group Details: the "Report group or member" button with its
 * dialog, and the notice that replaces it once the student has reported.
 *
 * The student's open reports are fetched separately from the group, and
 * only theirs: the group's details never carry reports, so its leader and
 * members cannot learn who reported it.
 */
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { api, type GroupDetails, type MyOpenReport } from '../api';
import { CheckCircleIcon, FlagIcon } from '../components/icons';
import { useApiData } from '../hooks/useApiData';
import { ReportDialog } from './ReportDialog';
import { dayAndDate } from './reportWording';

export interface MyOpenReports {
  reports: MyOpenReport[];
  reload: () => void;
}

/**
 * The student's open reports about the group. If they cannot be loaded the
 * page simply offers Report again; a duplicate is refused by the server and
 * answered with the notice.
 */
export function useMyOpenReports(groupId: string): MyOpenReports {
  const { data, reload } = useApiData(() => api.fetchMyReports(groupId), [groupId]);
  return { reports: data?.reports ?? [], reload };
}

interface ReportedNoticesProps {
  reports: MyOpenReport[];
  /** Move focus to the newest notice: the student has just sent that report. */
  focusNewest: boolean;
}

export function ReportedNotices({ reports, focusNewest }: ReportedNoticesProps): ReactNode {
  const focusNotice = useCallback((notice: HTMLDivElement | null) => notice?.focus(), []);
  return reports.map((report, index) => (
    <div
      key={report.memberId ?? 'group'}
      ref={focusNewest && index === reports.length - 1 ? focusNotice : undefined}
      className="cm-notice"
      role="status"
      tabIndex={-1}
    >
      <CheckCircleIcon />
      <span className="cm-notice__body">
        {report.memberId === null
          ? `You reported this group on ${dayAndDate(report.reportedAt)}. A moderator is reviewing it; you don’t need to report it again.`
          : `You reported ${report.memberName ?? 'a member'} on ${dayAndDate(report.reportedAt)}. A moderator is reviewing it; you don’t need to report them again.`}
      </span>
    </div>
  ));
}

interface ReportEntryProps {
  group: GroupDetails;
  viewerId: string | undefined;
  reports: MyOpenReport[];
  onReported: () => void;
}

/**
 * Nothing to show once the student has reported the whole group (a moderator
 * now reviews all of it), or when there is nobody left they could report.
 */
export function ReportEntry({ group, viewerId, reports, onReported }: ReportEntryProps): ReactNode {
  const [dialogOpen, setDialogOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const reportedMemberIds = new Set(reports.map((report) => report.memberId));
  if (reportedMemberIds.has(null)) return null;
  // A leader who wants their group gone deletes it instead.
  const canReportGroup = group.viewerRole !== 'leader';
  const members = group.members.filter(
    (member) => member.userId !== viewerId && !reportedMemberIds.has(member.userId),
  );
  if (!canReportGroup && members.length === 0) return null;

  function close(): void {
    setDialogOpen(false);
    buttonRef.current?.focus();
  }

  return (
    <div className="cm-report-entry">
      <button
        ref={buttonRef}
        type="button"
        className="cm-btn cm-btn--quiet cm-btn--sm"
        aria-haspopup="dialog"
        onClick={() => setDialogOpen(true)}
      >
        <FlagIcon />
        {canReportGroup ? 'Report group or member' : 'Report a member'}
      </button>
      {dialogOpen && (
        <ReportDialog
          groupId={group.id}
          canReportGroup={canReportGroup}
          members={members}
          onClose={close}
          onReported={() => {
            setDialogOpen(false);
            onReported();
          }}
        />
      )}
    </div>
  );
}
