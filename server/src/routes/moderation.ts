/**
 *   GET    /api/moderation/me                                     { isModerator, openCount } for the navigation
 *   GET    /api/moderation/reports                                the queue and the recent decisions
 *   POST   /api/moderation/groups/:id/keep                        resolve the group's reports, change nothing
 *   POST   /api/moderation/groups/:id/members/:userId/keep        resolve a member's reports, change nothing
 *   DELETE /api/moderation/groups/:id                             take the group down
 *   DELETE /api/moderation/groups/:id/members/:userId             take the member out of the group
 *
 * Everything but /me answers 403 to anyone who is not a moderator. /me is
 * open to every signed-in student because it only says whether *they* are
 * one, so the navigation can leave the Reports item out without asking an
 * endpoint that refuses them. The flag is read from the database on every
 * request, never from the session, so revoking it takes effect at once.
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import { HttpError } from '../errors.js';
import { parseUuid } from '../groups/validation.js';
import type { ModerationRepository, ReportTarget } from '../moderation/repository.js';
import { requireViewerId } from './me.js';

function requireUuidParam(req: Request, name: 'groupId' | 'userId', label: string): string {
  const id = parseUuid(req.params[name]);
  if (id === null) {
    throw HttpError.badRequest(`invalid_${name}`, `That is not a valid ${label} id.`);
  }
  return id;
}

export function createModerationRouter(repository: ModerationRepository): Router {
  const router = Router();

  router.get('/me', async (req: Request, res: Response) => {
    const isModerator = await repository.isModerator(requireViewerId(req));
    res.status(200).json({ isModerator, openCount: isModerator ? await repository.countOpenTargets() : null });
  });

  // Every route below this line is for moderators only.
  router.use(async (req: Request, _res: Response, next: NextFunction) => {
    if (!(await repository.isModerator(requireViewerId(req)))) {
      throw HttpError.forbidden('not_moderator', 'Only moderators can review reports.');
    }
    next();
  });

  router.get('/reports', async (_req: Request, res: Response) => {
    const [open, resolved, resolvedCount] = await Promise.all([
      repository.listOpenTargets(),
      repository.listResolvedTargets(),
      repository.countResolvedTargets(),
    ]);
    res.status(200).json({ open, resolved, resolvedCount });
  });

  async function keep(req: Request, res: Response, target: ReportTarget): Promise<void> {
    const outcome = await repository.keepTarget(target, requireViewerId(req));
    switch (outcome) {
      case 'kept':
        res.status(204).end();
        return;
      case 'no_open_reports':
        throw HttpError.notFound(
          'no_open_reports',
          'There are no open reports about this any more. Another moderator may have resolved them.',
        );
    }
  }

  router.post('/groups/:groupId/keep', async (req: Request, res: Response) => {
    await keep(req, res, { groupId: requireUuidParam(req, 'groupId', 'group'), memberId: null });
  });

  router.post('/groups/:groupId/members/:userId/keep', async (req: Request, res: Response) => {
    await keep(req, res, {
      groupId: requireUuidParam(req, 'groupId', 'group'),
      memberId: requireUuidParam(req, 'userId', 'member'),
    });
  });

  router.delete('/groups/:groupId', async (req: Request, res: Response) => {
    const groupId = requireUuidParam(req, 'groupId', 'group');
    const outcome = await repository.removeGroup(groupId, requireViewerId(req));
    switch (outcome) {
      case 'removed':
        res.status(204).end();
        return;
      case 'group_not_found':
        throw HttpError.notFound('group_not_found', 'That group no longer exists.');
    }
  });

  router.delete('/groups/:groupId/members/:userId', async (req: Request, res: Response) => {
    const groupId = requireUuidParam(req, 'groupId', 'group');
    const memberId = requireUuidParam(req, 'userId', 'member');
    const outcome = await repository.removeMember(groupId, memberId, requireViewerId(req));
    switch (outcome) {
      case 'removed':
        res.status(204).end();
        return;
      case 'group_not_found':
        throw HttpError.notFound('group_not_found', 'That group no longer exists.');
      case 'is_leader':
        throw HttpError.conflict(
          'member_is_leader',
          'This student leads the group, so they cannot be taken out of it. Remove the group instead.',
        );
      case 'not_member':
        throw HttpError.notFound('not_member', 'This student is no longer in the group.');
    }
  });

  return router;
}
