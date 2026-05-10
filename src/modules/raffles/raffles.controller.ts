import type { Request, Response, NextFunction } from 'express';
import * as rafflesService from './raffles.service';
import { createRaffleSchema, updateRaffleSchema, finishRaffleSchema } from './raffles.schemas';
import type { AuthRequest } from '../../middleware/auth';

export async function getMyRaffles(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthRequest).userId;
    const raffles = await rafflesService.getMyRaffles(userId);
    res.json({ raffles });
  } catch (err) {
    next(err);
  }
}

export async function getRaffleBySlug(req: Request, res: Response, next: NextFunction) {
  try {
    const username = req.params.username as string;
    const slug = req.params.slug as string;
    const accessCode = req.query.code as string | undefined;
    const result = await rafflesService.getRaffleBySlug(username, slug, accessCode);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function createRaffle(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthRequest).userId;
    const input = createRaffleSchema.parse(req.body);
    const raffle = await rafflesService.createRaffle(userId, input);
    res.status(201).json({ raffle });
  } catch (err) {
    next(err);
  }
}

export async function updateRaffle(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthRequest).userId;
    const input = updateRaffleSchema.parse(req.body);
    const raffle = await rafflesService.updateRaffle(req.params.raffleId as string, userId, input);
    res.json({ raffle });
  } catch (err) {
    next(err);
  }
}

export async function deleteRaffle(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthRequest).userId;
    await rafflesService.deleteRaffle(req.params.raffleId as string, userId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function finishRaffle(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthRequest).userId;
    const input = finishRaffleSchema.parse(req.body);
    const raffle = await rafflesService.finishRaffle(req.params.raffleId as string, userId, input);
    res.json({ raffle });
  } catch (err) {
    next(err);
  }
}
