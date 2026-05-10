import { z } from 'zod';

const basePromotionSchema = z.object({
  type: z.enum(['pack', 'percentage', 'bundle']),
  label: z.string().min(1).max(100),
  quantity: z.number().int().min(2),
  price: z.number().min(0).optional(),
  discount_percentage: z.number().int().min(1).max(99).optional(),
  free_numbers: z.number().int().min(1).optional(),
  active: z.boolean().default(true),
});

export const createPromotionSchema = basePromotionSchema.refine(
  (d) => {
    if (d.type === 'pack') return d.price !== undefined;
    if (d.type === 'percentage') return d.discount_percentage !== undefined;
    if (d.type === 'bundle') return d.free_numbers !== undefined;
    return true;
  },
  { message: 'Faltan campos requeridos para este tipo de promoción' }
);

export const updatePromotionSchema = basePromotionSchema.partial();

export type CreatePromotionInput = z.infer<typeof createPromotionSchema>;
export type UpdatePromotionInput = z.infer<typeof updatePromotionSchema>;
