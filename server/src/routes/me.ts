/**
 *   GET  /api/me/courses    the signed-in student's courses
 *   POST /api/me/courses    add a course: { courseId }
 */
import { Router, type Request, type Response } from 'express';
import { HttpError } from '../errors.js';
import { parseEnrollInput } from '../groups/validation.js';
import type { GroupRepository } from '../groups/repository.js';

export function createMeRouter(repository: GroupRepository): Router {
  const router = Router();

  router.get('/courses', async (req: Request, res: Response) => {
    const viewerId = requireViewerId(req);
    res.status(200).json({ courses: await repository.listMyCourses(viewerId) });
  });

  router.post('/courses', async (req: Request, res: Response) => {
    const viewerId = requireViewerId(req);
    const { courseId } = parseEnrollInput(req.body);
    const course = await repository.findCourse(courseId);
    if (course === null) {
      throw HttpError.notFound('course_not_found', 'That course does not exist.');
    }
    // Adding a course twice is harmless, so it is not an error.
    await repository.enrollInCourse(viewerId, courseId);
    res.status(200).json({ course });
  });

  return router;
}

export function requireViewerId(req: Request): string {
  const session = req.session;
  if (session === undefined) {
    // Unreachable behind requireAuth; guards the type.
    throw HttpError.unauthorized('not_authenticated', 'You are not signed in.');
  }
  return session.userId;
}
