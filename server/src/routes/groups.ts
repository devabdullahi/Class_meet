/**
 *   POST /api/groups                                       create a group; the creator becomes leader and first member
 *   GET  /api/groups/:id                                   one group, its members, and the viewer's relationship to it
 *   PATCH /api/groups/:id                                  leader changes the group's settings (all of them, not the course)
 *   DELETE /api/groups/:id                                 leader deletes the group, with its members and requests
 *   POST /api/groups/:id/join-requests                     ask to join
 *   DELETE /api/groups/:id/members/me                      leave a group you are in (not one you lead)
 *   DELETE /api/groups/:id/join-requests/mine              withdraw your own pending request
 *   POST /api/groups/:id/join-requests/:requestId/decision leader approves or declines: { decision }
 *
 * Starting a group and asking to join one need the course on the student's
 * list (403 course_not_added otherwise). That is what lets Remove course
 * promise that My groups never shows a group of a course the student dropped.
 * Viewing a group stays open to any signed-in student, so a link shared by a
 * classmate works before they have added the course.
 */
import { Router, type Request, type Response } from 'express';
import { HttpError } from '../errors.js';
import { isUuid, parseCreateGroupInput, parseJoinDecision, parseUpdateGroupInput } from '../groups/validation.js';
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
    const course = await repository.findCourse(input.courseId);
    if (course === null) {
      throw HttpError.notFound('course_not_found', 'That course does not exist.');
    }

    const result = await repository.createGroup(viewerId, input);
    if (result.outcome === 'not_enrolled') {
      throw HttpError.forbidden(
        'course_not_added',
        `Add ${course.code} to your courses before starting a group in it.`,
      );
    }
    const group = await repository.findGroup(result.groupId, viewerId);
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

  router.patch('/:groupId', async (req: Request, res: Response) => {
    const groupId = requireGroupId(req.params['groupId']);
    const settings = parseUpdateGroupInput(req.body);
    const viewerId = requireViewerId(req);
    const outcome = await repository.updateGroup(groupId, viewerId, settings);
    switch (outcome) {
      case 'updated': {
        const group = await repository.findGroup(groupId, viewerId);
        res.status(200).json({ group });
        return;
      }
      case 'group_not_found':
        throw HttpError.notFound('group_not_found', 'That group does not exist.');
      case 'not_leader':
        throw HttpError.forbidden('not_leader', 'Only the group leader can edit the group.');
      case 'size_below_member_count':
        throw HttpError.badRequest(
          'invalid_maxMembers',
          'Group size cannot be less than the number of members already in the group.',
        );
    }
  });

  router.delete('/:groupId', async (req: Request, res: Response) => {
    const groupId = requireGroupId(req.params['groupId']);
    const outcome = await repository.deleteGroup(groupId, requireViewerId(req));
    switch (outcome) {
      case 'deleted':
        res.status(204).end();
        return;
      case 'group_not_found':
        throw HttpError.notFound('group_not_found', 'That group does not exist.');
      case 'not_leader':
        throw HttpError.forbidden('not_leader', 'Only the group leader can delete the group.');
    }
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
      case 'not_enrolled':
        throw HttpError.forbidden(
          'course_not_added',
          'Add this course to your courses before asking to join one of its groups.',
        );
      case 'group_full':
        throw HttpError.conflict('group_full', 'This group is full.');
    }
  });

  router.delete('/:groupId/members/me', async (req: Request, res: Response) => {
    const groupId = requireGroupId(req.params['groupId']);
    const outcome = await repository.leaveGroup(groupId, requireViewerId(req));
    switch (outcome) {
      case 'left':
        res.status(204).end();
        return;
      case 'group_not_found':
        throw HttpError.notFound('group_not_found', 'That group does not exist.');
      case 'is_leader':
        throw HttpError.conflict('leader_cannot_leave', 'You lead this group, so you cannot leave it.');
      case 'not_member':
        throw HttpError.notFound('not_member', 'You are not a member of this group.');
    }
  });

  router.delete('/:groupId/join-requests/mine', async (req: Request, res: Response) => {
    const groupId = requireGroupId(req.params['groupId']);
    const outcome = await repository.withdrawJoinRequest(groupId, requireViewerId(req));
    switch (outcome) {
      case 'withdrawn':
        res.status(204).end();
        return;
      case 'request_not_found':
        throw HttpError.notFound('request_not_found', 'You have no pending request for this group.');
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
