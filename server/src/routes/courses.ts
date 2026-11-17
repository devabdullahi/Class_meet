/**
 *   GET /api/courses?q=                 courses, optionally filtered by code or title,
 *                                       each marked with whether the student has added it
 *   GET /api/courses/by-code/:code      the course a course link names (/join/CSE-3311):
 *                                       whether the student has added it, how many
 *                                       classmates have, and its study groups
 *   GET /api/courses/:id/groups         the course, its study groups, and how many
 *                                       classmates have added it
 *
 * A course's groups are listed to any signed-in student, enrolled or not, so
 * they can look before adding the course. Taking part (creating or joining a
 * group) needs the course added; see routes/groups.ts.
 */
import { Router, type Request, type Response } from 'express';
import { HttpError } from '../errors.js';
import { isUuid, parseCourseLinkCode } from '../groups/validation.js';
import type { GroupRepository } from '../groups/repository.js';
import { requireViewerId } from './me.js';

const MAX_SEARCH_LENGTH = 100;

export function createCoursesRouter(repository: GroupRepository): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    const viewerId = requireViewerId(req);
    const rawSearch = req.query['q'];
    const search = typeof rawSearch === 'string' ? rawSearch.trim() : '';
    if (search.length > MAX_SEARCH_LENGTH) {
      throw HttpError.badRequest('invalid_search', `Search must be ${MAX_SEARCH_LENGTH} characters or fewer.`);
    }
    res.status(200).json({ courses: await repository.listCourses(search, viewerId) });
  });

  router.get('/by-code/:code', async (req: Request, res: Response) => {
    const viewerId = requireViewerId(req);
    const course = await repository.findCourseByLinkCode(parseCourseLinkCode(req.params['code']));
    if (course === null) {
      throw HttpError.notFound('course_not_found', 'No course has that code.');
    }
    const [enrolled, classmateCount, groups] = await Promise.all([
      repository.isEnrolled(viewerId, course.id),
      repository.countClassmates(course.id, viewerId),
      // Every group, not just the few the join page previews: which meet
      // soonest depends on the student's own clock, which the client has
      // (see sortByNextMeeting). These are the same summaries GET
      // /:courseId/groups gives any signed-in student, links withheld alike.
      repository.listGroupsForCourse(course.id, viewerId),
    ]);
    res.status(200).json({ course, enrolled, classmateCount, groups });
  });

  router.get('/:courseId/groups', async (req: Request, res: Response) => {
    const { courseId } = req.params;
    if (!isUuid(courseId)) {
      throw HttpError.badRequest('invalid_courseId', 'That is not a valid course id.');
    }
    const course = await repository.findCourse(courseId);
    if (course === null) {
      throw HttpError.notFound('course_not_found', 'That course does not exist.');
    }
    const viewerId = requireViewerId(req);
    const [groups, classmateCount] = await Promise.all([
      repository.listGroupsForCourse(courseId, viewerId),
      repository.countClassmates(courseId, viewerId),
    ]);
    res.status(200).json({ course, groups, classmateCount });
  });

  return router;
}
