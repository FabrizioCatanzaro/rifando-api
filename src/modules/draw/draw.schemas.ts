import { z } from 'zod';

export const submitDrawPaymentSchema = z.object({
  comprobante_url: z.string().url(),
});

export const executeDrawSchema = z.object({
  mode: z.enum(['all', 'sold']),
  allow_repeat: z.boolean().default(false),
});

export type SubmitDrawPaymentInput = z.infer<typeof submitDrawPaymentSchema>;
export type ExecuteDrawInput = z.infer<typeof executeDrawSchema>;

