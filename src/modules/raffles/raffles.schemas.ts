import { z } from 'zod';

export const createRaffleSchema = z.object({
  title: z.string().min(3).max(150),
  // Allow empty string (treat as absent)
  description: z.string().max(500).optional().transform((v) => v || undefined),
  total_numbers: z.number().int().min(11).max(10000),
  price_per_number: z.number().min(0),
  status: z.enum(['draft', 'active']).default('draft'),
  visibility: z.enum(['public', 'private']).default('public'),
  // 6-char code, only required when private
  access_code: z.string().length(6).optional().nullable().transform((v) => v ?? undefined),
  cover_icon: z.string().max(10).default('🔒'),
  draw_mode: z.enum(['all_sold', 'fixed_date', 'first_event']).default('all_sold'),
  // datetime-local inputs produce "YYYY-MM-DDTHH:mm" without timezone — accept any ISO-like string
  draw_date: z.string().optional().nullable().transform((v) => v || undefined),
  prize_assignment_mode: z.enum(['automatic', 'sequential_choice']).default('automatic'),
  rich_content: z.record(z.unknown()).optional(),
});

export const updateRaffleSchema = createRaffleSchema.partial();

export const finishRaffleSchema = z.object({
  winner_number: z.number().int().min(0),
});

export type CreateRaffleInput = z.infer<typeof createRaffleSchema>;
export type UpdateRaffleInput = z.infer<typeof updateRaffleSchema>;
export type FinishRaffleInput = z.infer<typeof finishRaffleSchema>;
