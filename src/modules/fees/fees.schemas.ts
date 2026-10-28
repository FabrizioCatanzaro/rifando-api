import { z } from 'zod';

export const submitFeePaymentSchema = z.object({
  comprobante_url: z.string().url(),
});

export type SubmitFeePaymentInput = z.infer<typeof submitFeePaymentSchema>;
