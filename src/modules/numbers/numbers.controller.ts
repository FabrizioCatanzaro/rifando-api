import type { Request, Response, NextFunction } from 'express';
import * as numbersService from './numbers.service';
import {
  reserveSchema,
  releaseReservationSchema,
  sellNumberSchema,
  updateBuyerSchema,
  bulkSellSchema,
  bulkReleaseSchema,
} from './numbers.schemas';
import type { AuthRequest } from '../../middleware/auth';

export async function getNumbers(req: Request, res: Response, next: NextFunction) {
  try {
    const numbers = await numbersService.getNumbers(req.params.raffleId as string);
    res.json({ numbers });
  } catch (err) {
    next(err);
  }
}

export async function reserveNumbers(req: Request, res: Response, next: NextFunction) {
  try {
    const input = reserveSchema.parse(req.body);
    const result = await numbersService.reserveNumbers(req.params.raffleId as string, input);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function releaseReservation(req: Request, res: Response, next: NextFunction) {
  try {
    const input = releaseReservationSchema.parse(req.body);
    await numbersService.releaseReservation(req.params.raffleId as string, input.session_id, input.numbers);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function sellNumber(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthRequest).userId;
    const input = sellNumberSchema.parse(req.body);
    const number = parseInt(req.params.number as string, 10);
    const updated = await numbersService.sellNumber(req.params.raffleId as string, userId, number, input);
    res.json({ number: updated });
  } catch (err) {
    next(err);
  }
}

export async function releaseNumber(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthRequest).userId;
    const number = parseInt(req.params.number as string, 10);
    await numbersService.releaseNumber(req.params.raffleId as string, userId, number);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function updateBuyer(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthRequest).userId;
    const number = parseInt(req.params.number as string, 10);
    const input = updateBuyerSchema.parse(req.body);
    const updated = await numbersService.updateBuyer(req.params.raffleId as string, userId, number, input);
    res.json({ number: updated });
  } catch (err) {
    next(err);
  }
}

export async function getBuyers(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthRequest).userId;
    const buyers = await numbersService.getBuyers(req.params.raffleId as string, userId);
    res.json({ buyers });
  } catch (err) {
    next(err);
  }
}

export async function bulkSell(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthRequest).userId;
    const input = bulkSellSchema.parse(req.body);
    await numbersService.bulkSell(req.params.raffleId as string, userId, input);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function bulkRelease(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthRequest).userId;
    const input = bulkReleaseSchema.parse(req.body);
    await numbersService.bulkRelease(req.params.raffleId as string, userId, input);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
