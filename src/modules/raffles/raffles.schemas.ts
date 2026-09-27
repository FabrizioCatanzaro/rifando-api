import { z } from 'zod';

const baseRaffleSchema = z.object({
  title: z.string().trim().min(3).max(150),
  // Allow empty string (treat as absent)
  description: z.string().max(500).optional().transform((v) => v || undefined),
  total_numbers: z.number().int().min(11).max(10000),
  price_per_number: z.number().min(0),
  visibility: z.enum(['public', 'private']).default('public'),
  // Código de 6 caracteres. Si la rifa es privada y falta, la API lo genera.
  access_code: z
    .string()
    .regex(/^[A-Za-z0-9]{6}$/, 'El código tiene 6 letras o números')
    .optional()
    .nullable()
    .transform((v) => v ?? undefined),
  cover_icon: z.string().max(10).default('🔒'),
  draw_mode: z.enum(['all_sold', 'fixed_date', 'first_event']).default('all_sold'),
  // datetime-local inputs produce "YYYY-MM-DDTHH:mm" without timezone — accept any ISO-like string
  draw_date: z
    .string()
    .optional()
    .nullable()
    .transform((v) => v || undefined)
    .refine((v) => v === undefined || !Number.isNaN(Date.parse(v)), 'Fecha inválida'),
  prize_assignment_mode: z.enum(['automatic', 'sequential_choice']).default('automatic'),
  rich_content: z.record(z.unknown()).optional(),
  confirmation_method: z.enum(['whatsapp', 'upload']).default('whatsapp'),
});

// Una rifa siempre nace en borrador. Se publica con PATCH { status: 'active' }.
export const createRaffleSchema = baseRaffleSchema.superRefine((data, ctx) => {
  if (data.draw_mode !== 'all_sold' && !data.draw_date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['draw_date'],
      message: 'Elegí la fecha límite del sorteo',
    });
  }
});

export const updateRaffleSchema = baseRaffleSchema
  .extend({ status: z.enum(['draft', 'active']) })
  .partial();

export const finishRaffleSchema = z.object({
  winner_number: z.number().int().min(0).optional().nullable(),
});

export type CreateRaffleInput = z.infer<typeof createRaffleSchema>;
export type UpdateRaffleInput = z.infer<typeof updateRaffleSchema>;
export type FinishRaffleInput = z.infer<typeof finishRaffleSchema>;
