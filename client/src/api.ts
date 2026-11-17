/**
 * The one place that talks to the API.
 *
 * Every call goes through `request`, so there is exactly one implementation of
 * "send credentials, send the CSRF header, and turn a failure into an error
 * object the UI can render". Nothing in the app calls `fetch` directly.
 */

/** Mirrors the server's `PublicUser`. Small enough to keep in both places. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  lastLoginAt: string;
}

export interface SessionResponse {
  user: AuthUser;
}

/**
 * Mirrors `GET /api/auth/config`. The server owns these values because it is
 * the side that validates the tokens they produce.
 */
export interface AuthConfigResponse {
  /** Domains whose addresses may sign in with an emailed code, e.g. `mavs.uta.edu`. */
  emailDomains: string[];
  /**
   * Whether to offer Microsoft sign-in, and so whether to load MSAL at all.
   * Off unless the server has ENABLE_MICROSOFT_LOGIN=true and ENTRA_CLIENT_ID.
   */
  microsoftLoginEnabled: boolean;
  /** False until ENTRA_CLIENT_ID is set in server/.env. */
  configured: boolean;
  /** The server's copy of the Application (client) ID. Compared with ours. */
  clientId: string;
  tenantId: string;
  tenantDisplayName: string;
  /** `api://<client-id>/<scope>` — what MSAL must request. Blank if unconfigured. */
  apiScope: string;
  /**
   * DEVELOPMENT SIGN-IN BYPASS — REMOVE BEFORE THE PILOT. True only when the
   * server has ALLOW_DEV_LOGIN=true and is not in production.
   */
  devLoginEnabled: boolean;
}

/** Mirrors `POST /api/auth/email/start`: the code is on its way. */
export interface CodeSentResponse {
  /** The address as the server normalised it (lowercased, plus tag removed). */
  email: string;
  expiresInSeconds: number;
  /** How long until another code may be sent to the same address. */
  resendAfterSeconds: number;
}

// ---- Courses and study groups (mirror server/src/groups/repository.ts) ------

export type MeetingDay =
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday'
  | 'Saturday'
  | 'Sunday';

export type GroupFormat = 'in_person' | 'online';

export interface Course {
  id: string;
  code: string;
  title: string;
}

export interface CourseSearchResult extends Course {
  /** Whether the signed-in student has already added this course. */
  enrolled: boolean;
}

export interface EnrolledCourse extends Course {
  groupCount: number;
  /** Groups with a seat left. */
  openGroupCount: number;
  /** Groups the student leads or belongs to. */
  joinedGroupCount: number;
  /** Other students who have added the course: a count, never who. */
  classmateCount: number;
}

export interface GroupSummary {
  id: string;
  courseId: string;
  /** Null for groups created before groups had names; show `groupTitle` instead of reading it directly. */
  name: string | null;
  goal: string;
  meetingDay: MeetingDay;
  /** "HH:MM", 24-hour. */
  meetingTime: string;
  format: GroupFormat;
  /**
   * A place for in-person groups, a meeting link for online ones. Null for an
   * online group the viewer is not in: the server shares links with members only.
   */
  location: string | null;
  maxMembers: number;
  memberCount: number;
  /** The group chat's invite link. Null when there is none, or for a viewer outside the group: the server shares it with members only. */
  chatLink: string | null;
  /** Whether the group has a chat at all, which anyone may know. */
  hasChatLink: boolean;
  viewerRole: 'leader' | 'member' | 'none';
  viewerRequestStatus: 'pending' | 'declined' | null;
}

export interface GroupMember {
  userId: string;
  name: string;
  isLeader: boolean;
}

export interface PendingJoinRequest {
  id: string;
  userId: string;
  name: string;
  /** What the student chose to tell leaders; null when they have not added a profile. */
  profile: StudentProfile | null;
}

export interface GroupDetails extends GroupSummary {
  courseCode: string;
  courseTitle: string;
  members: GroupMember[];
  /** Only filled in for the group's leader. */
  pendingRequests: PendingJoinRequest[];
}

/** A group as My groups lists it: the summary plus the course it belongs to. */
export interface MyGroupSummary extends GroupSummary {
  courseCode: string;
  courseTitle: string;
}

export interface LedGroupSummary extends MyGroupSummary {
  /** Join requests waiting for the student's answer. */
  pendingRequestCount: number;
}

/** Mirrors `GET /api/me/groups`. */
export interface MyGroups {
  leading: LedGroupSummary[];
  member: MyGroupSummary[];
  /** Groups the student asked to join; `viewerRequestStatus` is 'pending' or 'declined'. */
  requested: MyGroupSummary[];
}

/** Mirrors `GET /api/courses/:id/groups`. */
export interface CourseGroups {
  course: Course;
  groups: GroupSummary[];
  /** Other students who have added the course, not counting the viewer. */
  classmateCount: number;
}

/** Mirrors `GET /api/courses/by-code/:code`: what a course link (/join/CSE-3311) opens. */
export interface CourseLinkCourse extends CourseGroups {
  /** Whether the signed-in student has already added the course. */
  enrolled: boolean;
}

/** Everything about a group its leader chooses, and may later change. */
export interface GroupSettings {
  name: string;
  goal: string;
  meetingDay: MeetingDay;
  meetingTime: string;
  format: GroupFormat;
  location: string;
  maxMembers: number;
  /** Null for no group chat; an edit sending null takes an existing link away. */
  chatLink: string | null;
}

/** A group's course is fixed when it is created, so only creating names one. */
export interface CreateGroupRequest extends GroupSettings {
  courseId: string;
}

export type JoinDecision = 'approve' | 'decline';

// ---- Student profile (mirrors server/src/profiles/validation.ts) ----------

export type StudentYear = 'freshman' | 'sophomore' | 'junior' | 'senior' | 'graduate';
export type MeetingPreference = 'on_campus' | 'online' | 'either';
export type StudyStyle =
  | 'practice_problems'
  | 'talking_it_through'
  | 'quiet_focused_work'
  | 'teaching_each_other'
  | 'exam_cramming';

/** Every field is optional. Shown only to leaders of groups the student asks to join. */
export interface StudentProfile {
  major: string | null;
  year: StudentYear | null;
  meetingPreference: MeetingPreference | null;
  studyStyles: StudyStyle[];
}

// ---- Reports and moderation (mirror server/src/moderation/repository.ts) ----

export type ReportReason = 'exam_answers' | 'spam' | 'harassment' | 'not_study_group' | 'other';

export type ReportOutcome = 'kept' | 'removed' | 'removed_from_group';

export interface ReportRequest {
  /** Null reports the whole group. */
  memberId: string | null;
  reason: ReportReason;
  /** Optional; blank is stored as no details. */
  details: string;
}

/** One of the student's own open reports about a group. */
export interface MyOpenReport {
  memberId: string | null;
  memberName: string | null;
  reportedAt: string;
}

/** What is left of a group a moderator removed. */
export interface RemovedGroup {
  groupId: string;
  title: string;
  courseId: string;
  courseCode: string;
  removedAt: string;
}

/** Mirrors `GET /api/moderation/me`. `openCount` is null for anyone but a moderator. */
export interface ModerationStatus {
  isModerator: boolean;
  openCount: number | null;
}

export interface OpenReportTarget {
  groupId: string;
  groupTitle: string;
  courseId: string;
  courseCode: string;
  leaderName: string;
  memberCount: number;
  /** Null when the reports are about the whole group. */
  member: { userId: string; name: string; isLeader: boolean; inGroup: boolean } | null;
  reportCount: number;
  latestReport: {
    reason: ReportReason;
    details: string | null;
    reporterName: string;
    reportedAt: string;
  };
}

export interface ResolvedReportTarget {
  groupId: string;
  /** Null only for a group its leader deleted after the reports were resolved. */
  groupTitle: string | null;
  courseCode: string | null;
  memberName: string | null;
  reportCount: number;
  reason: ReportReason;
  outcome: ReportOutcome;
  resolvedAt: string;
  resolvedById: string;
  resolvedByName: string;
}

/** Mirrors `GET /api/moderation/reports`. */
export interface ModerationReports {
  open: OpenReportTarget[];
  /** The most recent decisions only; `resolvedCount` counts them all. */
  resolved: ResolvedReportTarget[];
  resolvedCount: number;
}

/** An API failure with a message that is safe and useful to display. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** On a 429: how many seconds until trying again can work. Null otherwise. */
  readonly retryAfterSeconds: number | null;

  constructor(status: number, code: string, message: string, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  get isUnauthenticated(): boolean {
    return this.status === 401;
  }
}

function extractError(status: number, body: unknown): ApiError {
  if (typeof body === 'object' && body !== null) {
    const wrapper = (body as Record<string, unknown>)['error'];
    if (typeof wrapper === 'object' && wrapper !== null) {
      const record = wrapper as Record<string, unknown>;
      const code = typeof record['code'] === 'string' ? record['code'] : 'unknown_error';
      const message =
        typeof record['message'] === 'string' ? record['message'] : 'The request failed.';
      const retryAfter = record['retryAfterSeconds'];
      return new ApiError(status, code, message, typeof retryAfter === 'number' ? retryAfter : null);
    }
  }
  return new ApiError(status, 'unknown_error', `The request failed (HTTP ${status}).`);
}

let sessionExpiredHandler: (() => void) | null = null;

/**
 * Called when an API call answers 401, meaning the session cookie expired (or
 * was cleared) while the app was open. AuthProvider registers here to sign
 * the app out, so RequireAuth sends the student to sign in instead of every
 * screen offering "Try again" forever. The /api/auth/ endpoints are left out:
 * their 401 is the ordinary "not signed in" answer AuthProvider handles itself.
 */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  // Required by the server on any unsafe method; harmless on GET. A
  // cross-origin page cannot set it, which is what makes it a CSRF defence.
  headers.set('X-Class-Meet', '1');
  if (init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers,
      // Same-origin in dev (via the Vite proxy) and in production, so the
      // session cookie rides along without any CORS involvement.
      credentials: 'same-origin',
    });
  } catch {
    // Network-level failure: server down, offline, DNS. `fetch` only rejects
    // here, never for a 4xx/5xx, so this branch really is "no reply".
    throw new ApiError(
      0,
      'network_error',
      'Could not reach the Class Meet server. Check that it is running and try again.',
    );
  }

  let body: unknown = null;
  const text = await response.text().catch(() => '');
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/api/auth/')) {
      sessionExpiredHandler?.();
    }
    throw extractError(response.status, body);
  }

  // An assertion, not a validation: the only producer of these responses is
  // our own server, and the response types here are declared to match its
  // handlers. If the API ever accepts third-party data, this is where a
  // schema check belongs.
  return body as T;
}

export const api = {
  /**
   * Emails a sign-in code to a UTA address. Answers the same for every
   * allowed address; 400 `email_not_allowed` for any other, 429
   * `resend_too_soon` (with `retryAfterSeconds`) within a minute of the last.
   */
  startEmailSignIn: (email: string): Promise<CodeSentResponse> =>
    request<CodeSentResponse>('/api/auth/email/start', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  /** Exchanges the emailed code for a Class Meet session cookie. */
  verifyEmailCode: (email: string, code: string): Promise<SessionResponse> =>
    request<SessionResponse>('/api/auth/email/verify', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    }),

  /** Exchanges a Microsoft access token for a Class Meet session cookie. */
  signInWithEntra: (accessToken: string): Promise<SessionResponse> =>
    request<SessionResponse>('/api/auth/entra', {
      method: 'POST',
      body: JSON.stringify({ accessToken }),
    }),

  /** Resolves with the signed-in user, or throws ApiError 401. */
  fetchMe: (): Promise<SessionResponse> => request<SessionResponse>('/api/auth/me'),

  logout: (): Promise<{ ok: boolean }> =>
    request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  fetchAuthConfig: (): Promise<AuthConfigResponse> =>
    request<AuthConfigResponse>('/api/auth/config'),

  /**
   * DEVELOPMENT SIGN-IN BYPASS — REMOVE BEFORE THE PILOT. No body: the fake
   * identity is a server-side constant, not something a caller can choose.
   */
  devLogin: (): Promise<SessionResponse> =>
    request<SessionResponse>('/api/auth/dev-login', { method: 'POST' }),

  // ---- Courses and study groups ------------------------------------------

  /** Courses matching a code or title, each marked as added or not. */
  searchCourses: (search: string): Promise<{ courses: CourseSearchResult[] }> =>
    request<{ courses: CourseSearchResult[] }>(`/api/courses?q=${encodeURIComponent(search)}`),

  fetchMyCourses: (): Promise<{ courses: EnrolledCourse[] }> =>
    request<{ courses: EnrolledCourse[] }>('/api/me/courses'),

  enrollInCourse: (courseId: string): Promise<{ course: Course }> =>
    request<{ course: Course }>('/api/me/courses', {
      method: 'POST',
      body: JSON.stringify({ courseId }),
    }),

  /**
   * Refused (409) while the student leads or is in one of the course's
   * groups; otherwise their requests to its groups are withdrawn with it.
   */
  removeCourse: (courseId: string): Promise<null> =>
    request<null>(`/api/me/courses/${courseId}`, { method: 'DELETE' }),

  fetchMyGroups: (): Promise<MyGroups> => request<MyGroups>('/api/me/groups'),

  /** Join requests waiting across every group the student leads. */
  fetchPendingRequestCount: (): Promise<{ pendingRequestCount: number }> =>
    request<{ pendingRequestCount: number }>('/api/me/groups/pending-request-count'),

  /** The signed-in student's own profile; null when they have not added one. */
  fetchProfile: (): Promise<{ profile: StudentProfile | null }> =>
    request<{ profile: StudentProfile | null }>('/api/me/profile'),

  /** Saves the whole profile. An empty one is removed, and comes back as null. */
  saveProfile: (profile: StudentProfile): Promise<{ profile: StudentProfile | null }> =>
    request<{ profile: StudentProfile | null }>('/api/me/profile', {
      method: 'PUT',
      body: JSON.stringify(profile),
    }),

  fetchCourseGroups: (courseId: string): Promise<CourseGroups> =>
    request<CourseGroups>(`/api/courses/${courseId}/groups`),

  /** The course a course link names; 404 when no course has that code. */
  fetchCourseByLinkCode: (code: string): Promise<CourseLinkCourse> =>
    request<CourseLinkCourse>(`/api/courses/by-code/${encodeURIComponent(code)}`),

  /** Works signed out: just the code and title, for the sign-in page a course link leads to. */
  fetchCourseLinkTitle: (code: string): Promise<{ course: Pick<Course, 'code' | 'title'> }> =>
    request<{ course: Pick<Course, 'code' | 'title'> }>(`/api/course-links/${encodeURIComponent(code)}`),

  fetchGroup: (groupId: string): Promise<{ group: GroupDetails }> =>
    request<{ group: GroupDetails }>(`/api/groups/${groupId}`),

  createGroup: (input: CreateGroupRequest): Promise<{ group: GroupDetails }> =>
    request<{ group: GroupDetails }>('/api/groups', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  /** Leader only. Sends every setting; returns the updated group. */
  updateGroup: (groupId: string, settings: GroupSettings): Promise<{ group: GroupDetails }> =>
    request<{ group: GroupDetails }>(`/api/groups/${groupId}`, {
      method: 'PATCH',
      body: JSON.stringify(settings),
    }),

  /** Leader only. The group's members and join requests go with it. */
  deleteGroup: (groupId: string): Promise<null> =>
    request<null>(`/api/groups/${groupId}`, { method: 'DELETE' }),

  requestToJoin: (groupId: string): Promise<{ status: 'pending' }> =>
    request<{ status: 'pending' }>(`/api/groups/${groupId}/join-requests`, { method: 'POST' }),

  /** Members only; the leader cannot leave the group they lead. */
  leaveGroup: (groupId: string): Promise<null> =>
    request<null>(`/api/groups/${groupId}/members/me`, { method: 'DELETE' }),

  withdrawJoinRequest: (groupId: string): Promise<null> =>
    request<null>(`/api/groups/${groupId}/join-requests/mine`, { method: 'DELETE' }),

  /** Leader only. Returns the updated group. */
  decideJoinRequest: (
    groupId: string,
    requestId: string,
    decision: JoinDecision,
  ): Promise<{ group: GroupDetails }> =>
    request<{ group: GroupDetails }>(`/api/groups/${groupId}/join-requests/${requestId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    }),

  // ---- Reports and moderation ---------------------------------------------

  /** Refused (409 already_reported) while the student's earlier report of the same target is open. */
  reportGroup: (groupId: string, report: ReportRequest): Promise<{ report: MyOpenReport }> =>
    request<{ report: MyOpenReport }>(`/api/groups/${groupId}/reports`, {
      method: 'POST',
      body: JSON.stringify(report),
    }),

  fetchMyReports: (groupId: string): Promise<{ reports: MyOpenReport[] }> =>
    request<{ reports: MyOpenReport[] }>(`/api/groups/${groupId}/reports/mine`),

  /** 404 unless a moderator removed the group. */
  fetchGroupRemoval: (groupId: string): Promise<{ removal: RemovedGroup }> =>
    request<{ removal: RemovedGroup }>(`/api/groups/${groupId}/removal`),

  fetchModerationStatus: (): Promise<ModerationStatus> => request<ModerationStatus>('/api/moderation/me'),

  /** Moderators only (403 for anyone else). */
  fetchModerationReports: (): Promise<ModerationReports> =>
    request<ModerationReports>('/api/moderation/reports'),

  /** Resolves the open reports about the group, or one member of it, and changes nothing else. */
  keepReported: (groupId: string, memberId: string | null): Promise<null> =>
    request<null>(
      memberId === null
        ? `/api/moderation/groups/${groupId}/keep`
        : `/api/moderation/groups/${groupId}/members/${memberId}/keep`,
      { method: 'POST' },
    ),

  /** Takes the group down for everyone and resolves every open report about it. */
  removeReportedGroup: (groupId: string): Promise<null> =>
    request<null>(`/api/moderation/groups/${groupId}`, { method: 'DELETE' }),

  removeReportedMember: (groupId: string, memberId: string): Promise<null> =>
    request<null>(`/api/moderation/groups/${groupId}/members/${memberId}`, { method: 'DELETE' }),
};
