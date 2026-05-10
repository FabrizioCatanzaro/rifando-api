import type { Request, Response, NextFunction } from 'express';
import * as promotionsService from './promotions.service';
import { createPromotionSchema, updatePromotionSchema } from './promotions.schemas';
import type { AuthRequest } from '../../middleware/auth';

export async function getPromotions(req: Request, res: Response, next: NextFunction) {
  try {
    const promotions = await promotionsService.getPromotions(req.params.raffleId as string);
    res.json({ promotions });
  } catch (err) {
    next(err);
  }
}

export async function createPromotion(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthRequest).userId;
    const input = createPromotionSchema.parse(req.body);
    const promotion = await promotionsService.createPromotion(req.params.raffleId as string, userId, input);
    res.status(201).json({ promotion });
  } catch (err) {
    next(err);
  }
}

export async function updatePromotion(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthRequest).userId;
    const input = updatePromotionSchema.parse(req.body);
    const promotion = await promotionsService.updatePromotion(
      req.params.raffleId as string,
      req.params.promotionId as string,
      userId,
      input
    );
    res.json({ promotion });
  } catch (err) {
    next(err);
  }
}

export async function deletePromotion(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthRequest).userId;
    await promotionsService.deletePromotion(
      req.params.raffleId as string,
      req.params.promotionId as string,
      userId
    );
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
