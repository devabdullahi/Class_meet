/**
 * Course links: /join/CSE-3311, a page anyone with a UTA account can open to
 * add the course in one tap (JoinCoursePage).
 *
 * The link is the course code with its space written as a hyphen. A code is
 * what students already pass around ("are you in CSE 3311?"), so the link
 * reads as one, stays the same for as long as the course is in the catalog,
 * and avoids the %20 a space would become. The server reads the code back in
 * any case, with a hyphen or a space (parseCourseLinkCode in
 * server/src/groups/validation.ts), so a link typed by hand still works.
 */

const COURSE_LINK_PREFIX = '/join/';

/**
 * Where a course link sent the student, passed to the course's Study Groups
 * page in the navigation state so it can say so.
 */
export type CourseLinkOutcome = 'added' | 'already_added';

/** "CSE 3311" -> "/join/CSE-3311". */
export function courseLinkPath(courseCode: string): string {
  return `${COURSE_LINK_PREFIX}${encodeURIComponent(courseCode.trim().replace(/\s+/g, '-'))}`;
}

/** The full link to share, on the origin the app is served from. */
export function courseLinkUrl(courseCode: string, origin: string = window.location.origin): string {
  return `${origin}${courseLinkPath(courseCode)}`;
}

/** "cse-3399" -> "CSE 3399": how to name a course from its link when the catalog does not know it. */
export function courseCodeFromLinkCode(linkCode: string): string {
  return linkCode.trim().replace(/[-\s]+/g, ' ').toUpperCase();
}

/** The code in a course link's path ("/join/CSE-3311" -> "CSE-3311"), or null for any other path. */
export function linkCodeFromPath(path: string): string | null {
  if (!path.startsWith(COURSE_LINK_PREFIX)) return null;
  const encoded = path.slice(COURSE_LINK_PREFIX.length).split(/[/?#]/)[0] ?? '';
  try {
    const code = decodeURIComponent(encoded);
    return code.trim() === '' ? null : code;
  } catch {
    // A malformed escape such as "%E0%A4%A" is not a course code.
    return null;
  }
}
