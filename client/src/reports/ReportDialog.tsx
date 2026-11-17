import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError, type GroupMember, type ReportReason } from '../api';
import { handleDialogKeys } from '../components/dialogKeys';
import { AlertIcon, CloseIcon } from '../components/icons';
import { describeError } from '../hooks/useApiData';
import { MAX_REPORT_DETAILS_LENGTH, REPORT_REASONS } from './reportWording';

/** The select's value for "The whole group"; every other value is a member's id. */
const WHOLE_GROUP = 'group';

interface ReportDialogProps {
  groupId: string;
  /** False for the group's leader, and once the student has reported the group. */
  canReportGroup: boolean;
  /** Members the student may report: not themselves, not anyone they already reported. */
  members: GroupMember[];
  onClose: () => void;
  /** After the report is filed, or when it turns out it already was. */
  onReported: () => void;
}

export function ReportDialog({ groupId, canReportGroup, members, onClose, onReported }: ReportDialogProps): ReactNode {
  const [target, setTarget] = useState(canReportGroup ? WHOLE_GROUP : (members[0]?.userId ?? WHOLE_GROUP));
  // No reason is chosen for the student: a preselected one would be the
  // answer every hurried report gives.
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [sendError, setSendError] = useState('');
  const [sending, setSending] = useState(false);
  const firstReasonRef = useRef<HTMLInputElement>(null);

  const reportedMember = members.find((member) => member.userId === target);
  const title = reportedMember === undefined ? 'Report this group' : `Report ${reportedMember.name}`;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (reason === null) {
      setReasonError('Choose what is wrong.');
      firstReasonRef.current?.focus();
      return;
    }

    setSendError('');
    setSending(true);
    try {
      await api.reportGroup(groupId, {
        memberId: reportedMember === undefined ? null : reportedMember.userId,
        reason,
        details,
      });
      onReported();
    } catch (failure) {
      // Reported from another tab in the meantime: the page's notice says so.
      if (failure instanceof ApiError && failure.code === 'already_reported') {
        onReported();
        return;
      }
      setSendError(describeError(failure, 'We could not send your report. Please try again.'));
      setSending(false);
    }
  }

  return (
    <div className="cm-dialog-backdrop">
      <section
        className="cm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        onKeyDown={(event) => handleDialogKeys(event, onClose)}
      >
        <header className="cm-dialog__header">
          <h2 id="report-title">{title}</h2>
          <button type="button" className="cm-btn cm-btn--icon" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </header>

        <form className="cm-report-form" noValidate onSubmit={(event) => void handleSubmit(event)}>
          <div className="cm-form-field">
            <label className="cm-label" htmlFor="report-target">
              Who are you reporting?
            </label>
            <select
              autoFocus
              id="report-target"
              className="cm-input"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            >
              {canReportGroup && <option value={WHOLE_GROUP}>The whole group</option>}
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.isLeader ? `${member.name} (leader)` : member.name}
                </option>
              ))}
            </select>
          </div>

          <fieldset
            className="cm-form-field"
            aria-describedby={reasonError ? 'report-reason-error' : undefined}
          >
            <legend className="cm-label">What is wrong?</legend>
            <div className="cm-radio-list">
              {REPORT_REASONS.map((option, index) => (
                <label key={option.value} className="cm-radio">
                  <input
                    ref={index === 0 ? firstReasonRef : undefined}
                    type="radio"
                    name="report-reason"
                    value={option.value}
                    checked={reason === option.value}
                    aria-invalid={reasonError !== ''}
                    onChange={() => {
                      setReason(option.value);
                      setReasonError('');
                    }}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
            {reasonError && (
              <p id="report-reason-error" className="cm-field-error" role="alert">
                {reasonError}
              </p>
            )}
          </fieldset>

          <div className="cm-form-field">
            <label className="cm-label" htmlFor="report-details">
              Anything a moderator should know? (optional)
            </label>
            <textarea
              id="report-details"
              className="cm-input"
              rows={2}
              maxLength={MAX_REPORT_DETAILS_LENGTH}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              aria-describedby="report-privacy"
            />
            <p id="report-privacy" className="cm-hint">
              Moderators see your name. The leader and members never do.
            </p>
          </div>

          {sendError && (
            <div className="cm-notice cm-notice--error" role="alert">
              <AlertIcon />
              <span className="cm-notice__body">{sendError}</span>
            </div>
          )}

          <footer className="cm-dialog__footer">
            <button type="button" className="cm-btn cm-btn--secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="cm-btn cm-btn--primary" disabled={sending}>
              {sending ? 'Sending…' : 'Send report'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
