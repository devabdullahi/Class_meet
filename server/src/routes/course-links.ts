/**
 *   GET /api/course-links/:code    the code and title of the course a course
 *                                  link names (/join/CSE-3311)      (no sign-in)
 *
 * The one course lookup open to a signed-out visitor, so the sign-in page a
 * course link leads to can name the course ("Join the CSE 3311 study
 * groups"). It answers with what the public course catalog already says and
 * nothing else: no id, no groups, no counts. Everything else about the
 * course is behind sign-in, at GET /api/courses/by-code/:code.
 */
import { Router, type Request, type Response } from 'express';
import { HttpError } from '../errors.js';
import { parseCourseLinkCode } from '../groups/validation.js';
import type { GroupRepository } from '../groups/repository.js';

export function createCourseLinksRouter(repository: GroupRepository): Router {
  const router = Router();

  router.get('/:code', async (req: Request, res: Response) => {
    const course = await repository.findCourseByLinkCode(parseCourseLinkCode(req.params['code']));
    if (course === null) {
      throw HttpError.notFound('course_not_found', 'No course has that code.');
    }
    res.status(200).json({ course: { code: course.code, title: course.title } });
  });

  return router;
}
