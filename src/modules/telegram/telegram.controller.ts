import type { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env';
import type { AuthRequest } from '../../middleware/auth';
import * as telegramService from './telegram.service';

export async function createLink(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthRequest).userId;
    const result = await telegramService.createLink(userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function unlink(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthRequest).userId;
    await telegramService.unlink(userId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function getStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthRequest).userId;
    const status = await telegramService.getStatus(userId);
    res.json(status);
  } catch (err) {
    next(err);
  }
}

/**
 * Endpoint público que llama Telegram. Se valida con el header secreto que
 * configuramos al registrar el webhook (setWebhook con secret_token).
 */
export async function webhook(req: Request, res: Response) {
  const secret = req.header('X-Telegram-Bot-Api-Secret-Token');

  if (!env.TELEGRAM_WEBHOOK_SECRET || secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    res.sendStatus(401);
    return;
  }

  // Respondemos 200 enseguida; procesamos sin bloquear la respuesta a Telegram.
  res.sendStatus(200);

  try {
    await telegramService.handleUpdate(req.body);
  } catch {
    // No re-lanzamos: Telegram reintentaría el update y ya respondimos 200.
  }
}
