/**
 *   POST /api/groups       create a group; the creator becomes its leader and first member
 *   GET  /api/groups/:id   one group with its members
 */
import { Router, type Request, type Response } from 'express';
import { HttpError } from '../errors.js';
import { isUuid, parseCreateGroupInput } from '../groups/validation.js';
import type { GroupRepository } from '../groups/repository.js';

export function createGroupsRouter(repository: GroupRepository): Router {
  const router = Router();

  router.post('/', async (req: Request, res: Response) => {
    const session = req.session;
    if (session === undefined) {
      // Unreachable behind requireAuth; guards the type.
      throw HttpError.unauthorized('not_authenticated', 'You are not signed in.');
    }
    // The development sign-in has no row in `users`, so it cannot own a group.
    if (session.dev === true) {
      throw HttpError.forbidden(
        'dev_session_cannot_create',
        'Creating a group needs a real account. Sign in with your UTA account.',
      );
    }

    const input = parseCreateGroupInput(req.body);
    if (!(await repository.courseExists(input.courseId))) {
      throw HttpError.notFound('course_not_found', 'That course does not exist.');
    }

    const groupId = await repository.createGroup(session.userId, input);
    const group = await repository.findGroup(groupId);
    res.status(201).json({ group });
  });

  router.get('/:groupId', async (req: Request, res: Response) => {
    const { groupId } = req.params;
    if (!isUuid(groupId)) {
      throw HttpError.badRequest('invalid_groupId', 'That is not a valid group id.');
    }
    const group = await repository.findGroup(groupId);
    if (group === null) {
      throw HttpError.notFound('group_not_found', 'That group does not exist.');
    }
    res.status(200).json({ group });
  });

  return router;
}
