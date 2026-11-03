/**
 *   POST /api/groups                                       create a group; the creator becomes leader and first member
 *   GET  /api/groups/:id                                   one group, its members, and the viewer's relationship to it
 *   POST /api/groups/:id/join-requests                     ask to join
 *   POST /api/groups/:id/join-requests/:requestId/decision leader approves or declines: { decision }
 */
import { Router, type Request, type Response } from 'express';
import { HttpError } from '../errors.js';
import { isUuid, parseCreateGroupInput, parseJoinDecision } from '../groups/validation.js';
import type { GroupRepository } from '../groups/repository.js';
import { requireViewerId } from './me.js';

function requireGroupId(value: unknown): string {
  if (!isUuid(value)) {
    throw HttpError.badRequest('invalid_groupId', 'That is not a valid group id.');
  }
  return value;
}

export function createGroupsRouter(repository: GroupRepository): Router {
  const router = Router();

  router.post('/', async (req: Request, res: Response) => {
    const viewerId = requireViewerId(req);
    const input = parseCreateGroupInput(req.body);
    if ((await repository.findCourse(input.courseId)) === null) {
      throw HttpError.notFound('course_not_found', 'That course does not exist.');
    }

    const groupId = await repository.createGroup(viewerId, input);
    const group = await repository.findGroup(groupId, viewerId);
    res.status(201).json({ group });
  });

  router.get('/:groupId', async (req: Request, res: Response) => {
    const groupId = requireGroupId(req.params['groupId']);
    const group = await repository.findGroup(groupId, requireViewerId(req));
    if (group === null) {
      throw HttpError.notFound('group_not_found', 'That group does not exist.');
    }
    res.status(200).json({ group });
  });

  router.post('/:groupId/join-requests', async (req: Request, res: Response) => {
    const groupId = requireGroupId(req.params['groupId']);
    const outcome = await repository.requestToJoin(groupId, requireViewerId(req));
    switch (outcome) {
      case 'created':
        res.status(201).json({ status: 'pending' });
        return;
      case 'group_not_found':
        throw HttpError.notFound('group_not_found', 'That group does not exist.');
      case 'already_member':
        throw HttpError.conflict('already_member', 'You are already in this group.');
      case 'already_requested':
        throw HttpError.conflict('already_requested', 'You have already asked to join this group.');
      case 'group_full':
        throw HttpError.conflict('group_full', 'This group is full.');
    }
  });

  router.post('/:groupId/join-requests/:requestId/decision', async (req: Request, res: Response) => {
    const groupId = requireGroupId(req.params['groupId']);
    const requestId: unknown = req.params['requestId'];
    if (!isUuid(requestId)) {
      throw HttpError.badRequest('invalid_requestId', 'That is not a valid request id.');
    }
    const decision = parseJoinDecision(req.body);
    const viewerId = requireViewerId(req);

    const outcome = await repository.decideJoinRequest(groupId, requestId, decision, viewerId);
    switch (outcome) {
      case 'decided': {
        const group = await repository.findGroup(groupId, viewerId);
        res.status(200).json({ group });
        return;
      }
      case 'group_not_found':
        throw HttpError.notFound('group_not_found', 'That group does not exist.');
      case 'not_leader':
        throw HttpError.forbidden('not_leader', 'Only the group leader can answer join requests.');
      case 'request_not_found':
        throw HttpError.notFound('request_not_found', 'That request does not exist or was already answered.');
      case 'group_full':
        throw HttpError.conflict('group_full', 'The group is full, so this request cannot be approved.');
    }
  });

  return router;
}
