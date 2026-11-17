/**
 *   GET  /api/me/courses                         the signed-in student's courses
 *   POST /api/me/courses                         add a course: { courseId }
 *   GET  /api/me/groups                          groups the student leads, is in, or asked to join
 *   GET  /api/me/groups/pending-request-count    join requests waiting in groups the student leads
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

  router.get('/groups', async (req: Request, res: Response) => {
    res.status(200).json(await repository.listMyGroups(requireViewerId(req)));
  });

  // Separate from GET /groups so the navigation badge, which every screen
  // shows, costs one count instead of the whole My groups listing.
  router.get('/groups/pending-request-count', async (req: Request, res: Response) => {
    const pendingRequestCount = await repository.countPendingRequestsForLeader(requireViewerId(req));
    res.status(200).json({ pendingRequestCount });
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
