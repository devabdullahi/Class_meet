/**
 *   GET /api/courses?q=            courses, optionally filtered by code or title
 *   GET /api/courses/:id/groups    study groups in one course
 */
import { Router, type Request, type Response } from 'express';
import { HttpError } from '../errors.js';
import { isUuid } from '../groups/validation.js';
import type { GroupRepository } from '../groups/repository.js';

const MAX_SEARCH_LENGTH = 100;

export function createCoursesRouter(repository: GroupRepository): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    const rawSearch = req.query['q'];
    const search = typeof rawSearch === 'string' ? rawSearch.trim() : '';
    if (search.length > MAX_SEARCH_LENGTH) {
      throw HttpError.badRequest('invalid_search', `Search must be ${MAX_SEARCH_LENGTH} characters or fewer.`);
    }
    res.status(200).json({ courses: await repository.listCourses(search) });
  });

  router.get('/:courseId/groups', async (req: Request, res: Response) => {
    const { courseId } = req.params;
    if (!isUuid(courseId)) {
      throw HttpError.badRequest('invalid_courseId', 'That is not a valid course id.');
    }
    if (!(await repository.courseExists(courseId))) {
      throw HttpError.notFound('course_not_found', 'That course does not exist.');
    }
    res.status(200).json({ groups: await repository.listGroupsForCourse(courseId) });
  });

  return router;
}
