/**
 *   GET /api/courses?q=            courses, optionally filtered by code or title,
 *                                  each marked with whether the student has added it
 *   GET /api/courses/:id/groups    the course and its study groups
 */
import { Router, type Request, type Response } from 'express';
import { HttpError } from '../errors.js';
import { isUuid } from '../groups/validation.js';
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

  router.get('/:courseId/groups', async (req: Request, res: Response) => {
    const { courseId } = req.params;
    if (!isUuid(courseId)) {
      throw HttpError.badRequest('invalid_courseId', 'That is not a valid course id.');
    }
    const course = await repository.findCourse(courseId);
    if (course === null) {
      throw HttpError.notFound('course_not_found', 'That course does not exist.');
    }
    res.status(200).json({ course, groups: await repository.listGroupsForCourse(courseId) });
  });

  return router;
}
