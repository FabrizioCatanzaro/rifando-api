import type { Request, Response, NextFunction } from 'express';
import * as prizesService from './prizes.service';
import { createPrizeSchema, updatePrizeSchema } from './prizes.schemas';
import type { AuthRequest } from '../../middleware/auth';

export async function getPrizes(req: Request, res: Response, next: NextFunction) {
  try {
    const prizes = await prizesService.getPrizes(req.params.raffleId as string);
    res.json({ prizes });
  } catch (err) {
    next(err);
  }
}

export async function createPrize(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthRequest).userId;
    const input = createPrizeSchema.parse(req.body);
    const prize = await prizesService.createPrize(req.params.raffleId as string, userId, input);
    res.status(201).json({ prize });
  } catch (err) {
    next(err);
  }
}

export async function updatePrize(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthRequest).userId;
    const input = updatePrizeSchema.parse(req.body);
    const prize = await prizesService.updatePrize(
      req.params.raffleId as string,
      req.params.prizeId as string,
      userId,
      input
    );
    res.json({ prize });
  } catch (err) {
    next(err);
  }
}

export async function deletePrize(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthRequest).userId;
    await prizesService.deletePrize(
      req.params.raffleId as string,
      req.params.prizeId as string,
      userId
    );
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
