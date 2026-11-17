/**
 *   GET  /api/me/courses                         the signed-in student's courses
 *   POST /api/me/courses                         add a course: { courseId }
 *   DELETE /api/me/courses/:courseId             remove a course (not while in one of its groups)
 *   GET  /api/me/groups                          groups the student leads, is in, or asked to join
 *   GET  /api/me/groups/pending-request-count    join requests waiting in groups the student leads
 */
import { Router, type Request, type Response } from 'express';
import { HttpError } from '../errors.js';
import { isUuid, parseEnrollInput } from '../groups/validation.js';
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

  router.delete('/courses/:courseId', async (req: Request, res: Response) => {
    const courseId: unknown = req.params['courseId'];
    if (!isUuid(courseId)) {
      throw HttpError.badRequest('invalid_courseId', 'That is not a valid course id.');
    }
    const course = await repository.findCourse(courseId);
    if (course === null) {
      throw HttpError.notFound('course_not_found', 'That course does not exist.');
    }
    const outcome = await repository.removeCourse(requireViewerId(req), courseId);
    switch (outcome) {
      case 'removed':
        res.status(204).end();
        return;
      case 'not_enrolled':
        throw HttpError.notFound('not_enrolled', `${course.code} is not one of your courses.`);
      case 'leads_group':
        throw HttpError.conflict(
          'leads_group_in_course',
          `You lead a study group in ${course.code}. Delete the group first, then remove the course.`,
        );
      case 'in_group':
        throw HttpError.conflict(
          'in_group_for_course',
          `You are in a study group for ${course.code}. Leave the group first, then remove the course.`,
        );
    }
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
