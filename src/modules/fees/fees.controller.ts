import type { Request, Response, NextFunction } from 'express';
import * as feesService from './fees.service';
import { submitFeePaymentSchema } from './fees.schemas';
import type { AuthRequest } from '../../middleware/auth';

export async function getConfig(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(feesService.getFeeConfig());
  } catch (err) {
    next(err);
  }
}

export async function getFeePayment(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthRequest).userId;
    const result = await feesService.getFeePaymentInfo(req.params.raffleId as string, userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function submitFeePayment(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthRequest).userId;
    const input = submitFeePaymentSchema.parse(req.body);
    const payment = await feesService.submitFeePayment(req.params.raffleId as string, userId, input);
    res.status(201).json({ payment });
  } catch (err) {
    next(err);
  }
}
