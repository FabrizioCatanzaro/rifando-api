import { z } from 'zod';

export const createPrizeSchema = z.object({
  title: z.string().min(1).max(40),
  description: z.string().max(100).optional(),
  image_url: z.string().url().optional(),
  position: z.number().int().min(1),
});

export const updatePrizeSchema = createPrizeSchema.partial().extend({
  winner_number: z.number().int().min(0).optional(),
});

export type CreatePrizeInput = z.infer<typeof createPrizeSchema>;
export type UpdatePrizeInput = z.infer<typeof updatePrizeSchema>;
