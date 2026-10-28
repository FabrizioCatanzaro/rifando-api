import { z } from 'zod';

/** Query con la que Mercado Pago vuelve al redirect de OAuth. */
export const oauthCallbackSchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).max(64).optional(),
  error: z.string().optional(),
});

export const checkoutParamsSchema = z.object({
  raffleId: z.string().uuid(),
  purchaseId: z.string().uuid(),
});

/** El comprador se identifica con el session_id que usó al reservar. */
export const createCheckoutSchema = z.object({
  session_id: z.string().min(1).max(100),
});

export const checkoutStatusSchema = z.object({
  session_id: z.string().min(1).max(100),
  /** payment_id que Mercado Pago agrega a la back_url. Si llega, se sincroniza el pago. */
  payment_id: z.coerce.number().int().positive().optional(),
});

export const listPaymentsSchema = z.object({
  raffle_id: z.string().uuid().optional(),
});

export type OAuthCallbackInput = z.infer<typeof oauthCallbackSchema>;
export type CheckoutStatusInput = z.infer<typeof checkoutStatusSchema>;
