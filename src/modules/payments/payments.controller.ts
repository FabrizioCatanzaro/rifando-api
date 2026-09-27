import type { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import type { AuthRequest } from '../../middleware/auth';
import { logger } from '../../utils/logger';
import * as paymentsService from './payments.service';
import {
  checkoutParamsSchema,
  checkoutStatusSchema,
  createCheckoutSchema,
  listPaymentsSchema,
  oauthCallbackSchema,
} from './payments.schemas';

export async function getStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthRequest).userId;
    res.json(await paymentsService.getStatus(userId));
  } catch (err) {
    next(err);
  }
}

export async function createLink(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthRequest).userId;
    res.json(await paymentsService.createAuthorizationUrl(userId));
  } catch (err) {
    next(err);
  }
}

/**
 * Redirect de OAuth. Lo abre el navegador del rifante al volver de Mercado Pago.
 * Siempre redirige a "Mis datos" con el resultado en la query (mp=linked | mp=error).
 */
export async function oauthCallback(req: Request, res: Response) {
  const settingsUrl = new URL(`${env.FRONTEND_URL.replace(/\/$/, '')}/dashboard/settings`);

  try {
    const query = oauthCallbackSchema.parse(req.query);
    if (query.error || !query.code || !query.state) {
      throw new AppError('Vinculación cancelada', 400);
    }
    await paymentsService.completeAuthorization(query.code, query.state);
    settingsUrl.searchParams.set('mp', 'linked');
  } catch (err) {
    const status = err instanceof AppError ? err.statusCode : 500;
    if (status >= 500) logger.error({ err }, 'Mercado Pago: error en el callback de OAuth');
    settingsUrl.searchParams.set('mp', 'error');
    settingsUrl.searchParams.set('mp_error', status === 409 ? 'taken' : status === 400 ? 'expired' : 'failed');
  }

  res.redirect(302, settingsUrl.toString());
}

export async function unlink(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthRequest).userId;
    await paymentsService.unlink(userId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function listPayments(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthRequest).userId;
    const { raffle_id } = listPaymentsSchema.parse(req.query);
    res.json(await paymentsService.listPayments(userId, raffle_id));
  } catch (err) {
    next(err);
  }
}

/** Público. El comprador inicia el pago de su compra pendiente. */
export async function createCheckout(req: Request, res: Response, next: NextFunction) {
  try {
    const { raffleId, purchaseId } = checkoutParamsSchema.parse(req.params);
    const { session_id } = createCheckoutSchema.parse(req.body);
    res.status(201).json(await paymentsService.createCheckout(raffleId, purchaseId, session_id));
  } catch (err) {
    next(err);
  }
}

/** Público. El comprador consulta el resultado al volver de Mercado Pago. */
export async function getCheckoutStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { raffleId, purchaseId } = checkoutParamsSchema.parse(req.params);
    const input = checkoutStatusSchema.parse(req.query);
    res.json(await paymentsService.getCheckoutStatus(raffleId, purchaseId, input));
  } catch (err) {
    next(err);
  }
}

/**
 * Público. Lo llama Mercado Pago. Se valida con x-signature.
 * Responde 200 al procesar. Ante un error propio responde 5xx para que Mercado Pago reintente.
 */
export async function webhook(req: Request, res: Response, next: NextFunction) {
  try {
    await paymentsService.handleWebhook({
      signature: req.header('x-signature'),
      requestId: req.header('x-request-id'),
      query: req.query as Record<string, unknown>,
      body: req.body,
    });
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
}
