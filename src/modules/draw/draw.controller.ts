import type { Request, Response, NextFunction } from 'express';
import * as drawService from './draw.service';
import { submitDrawPaymentSchema, executeDrawSchema } from './draw.schemas';
import type { AuthRequest } from '../../middleware/auth';

export async function submitDrawPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthRequest).userId;
    const input = submitDrawPaymentSchema.parse(req.body);
    const payment = await drawService.submitDrawPayment(req.params.raffleId as string, userId, input);
    res.status(201).json({ payment });
  } catch (err) {
    next(err);
  }
}

export async function getDrawPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthRequest).userId;
    const result = await drawService.getDrawPayment(req.params.raffleId as string, userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function executeDraw(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthRequest).userId;
    const input = executeDrawSchema.parse(req.body);
    const result = await drawService.executeDraw(req.params.raffleId as string, userId, input);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
