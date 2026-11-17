/**
 *   GET /api/me/profile    the signed-in student's own profile: { profile } (null when none)
 *   PUT /api/me/profile    save it: { major, year, meetingPreference, studyStyles }
 *
 * There is no route to read another student's profile. Leaders see it only
 * on their own group's pending join requests (GET /api/groups/:id).
 */
import { Router, type Request, type Response } from 'express';
import type { ProfileRepository } from '../profiles/repository.js';
import { parseProfileInput } from '../profiles/validation.js';
import { requireViewerId } from './me.js';

export function createProfileRouter(repository: ProfileRepository): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    const profile = await repository.findProfile(requireViewerId(req));
    res.status(200).json({ profile });
  });

  router.put('/', async (req: Request, res: Response) => {
    const input = parseProfileInput(req.body);
    const profile = await repository.saveProfile(requireViewerId(req), input);
    res.status(200).json({ profile });
  });

  return router;
}
