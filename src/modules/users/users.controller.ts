import type { Request, Response, NextFunction } from 'express';
import * as usersService from './users.service';
import { updateProfileSchema } from './users.schemas';
import type { AuthRequest } from '../../middleware/auth';

export async function getPublicProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await usersService.getPublicProfile(req.params.username as string);
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

export async function getPublicRaffles(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await usersService.getPublicRaffles(req.params.username as string);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthRequest).userId;
    const input = updateProfileSchema.parse(req.body);
    const user = await usersService.updateProfile(userId, input);
    res.json({ user });
  } catch (err) {
    next(err);
  }
}
