/**
 * How reports are worded on screen. The server stores and validates the
 * reason codes (server/src/moderation/validation.ts); the words are the
 * client's, in the order the report form offers them.
 */
import type { ReportOutcome, ReportReason } from '../api';

export const REPORT_REASONS: ReadonlyArray<{ value: ReportReason; label: string }> = [
  { value: 'exam_answers', label: 'Selling or sharing exam answers' },
  { value: 'spam', label: 'Spam or advertising' },
  { value: 'harassment', label: 'Harassment or hateful language' },
  { value: 'not_study_group', label: 'Not a real study group' },
  { value: 'other', label: 'Something else' },
];

/** Mirrors the server's MAX_REPORT_DETAILS_LENGTH. */
export const MAX_REPORT_DETAILS_LENGTH = 500;

export function reportReasonLabel(reason: ReportReason): string {
  return REPORT_REASONS.find((option) => option.value === reason)?.label ?? 'Something else';
}

export const REPORT_OUTCOME_LABELS: Record<ReportOutcome, string> = {
  kept: 'Kept',
  removed: 'Removed',
  removed_from_group: 'Removed from group',
};

/** "Nov 15": recent enough that the year goes without saying. */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** "Sat, Nov 14". */
export function dayAndDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "3 members", "1 member". */
export function countOf(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
