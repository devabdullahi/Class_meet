/**
 * Request validation for reporting a group or a member. Pure functions, no
 * I/O, so the rules are testable on their own and the report form can mirror
 * them.
 */
import { HttpError } from '../errors.js';
import { parseUuid } from '../groups/validation.js';

/**
 * What a student can say is wrong. The database CHECK in migration 007 holds
 * the same list; the client shows each code with its own wording.
 */
export const REPORT_REASONS = ['exam_answers', 'spam', 'harassment', 'not_study_group', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** Long enough for a few sentences of context, short enough to read in the queue. */
export const MAX_REPORT_DETAILS_LENGTH = 500;

export interface ReportInput {
  /** Null reports the whole group; otherwise the member being reported. */
  memberId: string | null;
  reason: ReportReason;
  /** Null when the student left the details blank. */
  details: string | null;
}

function isReportReason(value: unknown): value is ReportReason {
  return typeof value === 'string' && (REPORT_REASONS as readonly string[]).includes(value);
}

export function parseReportInput(body: unknown): ReportInput {
  if (typeof body !== 'object' || body === null) {
    throw HttpError.badRequest('invalid_body', 'Expected a JSON object.');
  }
  const record = body as Record<string, unknown>;

  const rawMemberId = record['memberId'] ?? null;
  const memberId = rawMemberId === null ? null : parseUuid(rawMemberId);
  if (rawMemberId !== null && memberId === null) {
    throw HttpError.badRequest('invalid_memberId', 'That is not a valid member id.');
  }

  const reason = record['reason'];
  if (!isReportReason(reason)) {
    throw HttpError.badRequest('invalid_reason', 'Choose what is wrong.');
  }

  const rawDetails = record['details'] ?? null;
  if (rawDetails !== null && typeof rawDetails !== 'string') {
    throw HttpError.badRequest('invalid_details', 'Details must be text.');
  }
  const details = rawDetails === null || rawDetails.trim() === '' ? null : rawDetails.trim();
  if (details !== null && details.length > MAX_REPORT_DETAILS_LENGTH) {
    throw HttpError.badRequest(
      'invalid_details',
      `Keep the details to ${MAX_REPORT_DETAILS_LENGTH} characters or fewer.`,
    );
  }

  return { memberId, reason, details };
}
