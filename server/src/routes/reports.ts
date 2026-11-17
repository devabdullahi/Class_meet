/**
 *   POST /api/groups/:id/reports        report the group, or a member of it: { memberId?, reason, details? }
 *   GET  /api/groups/:id/reports/mine   the viewer's own open reports about the group
 *   GET  /api/groups/:id/removal        what is left of a group a moderator removed, or 404
 *
 * Mounted on /api/groups next to the groups router. Reporting is open to any
 * signed-in student who can open the group, which (like viewing it) is any
 * signed-in student. Nothing here tells anyone but the reporter who reported
 * a group: its leader and members never see reports; moderators see them
 * through /api/moderation.
 */
import { Router, type Request, type Response } from 'express';
import { HttpError } from '../errors.js';
import { parseUuid } from '../groups/validation.js';
import type { ModerationRepository } from '../moderation/repository.js';
import { parseReportInput } from '../moderation/validation.js';
import { requireViewerId } from './me.js';

function requireGroupId(value: unknown): string {
  const groupId = parseUuid(value);
  if (groupId === null) {
    throw HttpError.badRequest('invalid_groupId', 'That is not a valid group id.');
  }
  return groupId;
}

export function createReportsRouter(repository: ModerationRepository): Router {
  const router = Router();

  router.post('/:groupId/reports', async (req: Request, res: Response) => {
    const groupId = requireGroupId(req.params['groupId']);
    const input = parseReportInput(req.body);
    const result = await repository.createReport(requireViewerId(req), groupId, input);
    switch (result.outcome) {
      case 'created':
        res.status(201).json({ report: result.report });
        return;
      case 'group_not_found':
        throw HttpError.notFound('group_not_found', 'That group does not exist.');
      case 'member_not_found':
        throw HttpError.notFound('member_not_found', 'That student is not in this group.');
      case 'reporting_self':
        throw HttpError.badRequest('reporting_self', 'You cannot report yourself.');
      case 'own_group':
        throw HttpError.badRequest(
          'own_group',
          'You lead this group. To take it down, delete it from its page.',
        );
      case 'already_reported':
        throw HttpError.conflict(
          'already_reported',
          'You already reported this. A moderator is reviewing it; you don’t need to report it again.',
        );
    }
  });

  router.get('/:groupId/reports/mine', async (req: Request, res: Response) => {
    const groupId = requireGroupId(req.params['groupId']);
    const reports = await repository.listMyOpenReports(requireViewerId(req), groupId);
    res.status(200).json({ reports });
  });

  router.get('/:groupId/removal', async (req: Request, res: Response) => {
    const groupId = requireGroupId(req.params['groupId']);
    const removal = await repository.findRemovedGroup(groupId);
    if (removal === null) {
      throw HttpError.notFound('not_removed', 'No moderator removed a group with that id.');
    }
    res.status(200).json({ removal });
  });

  return router;
}
