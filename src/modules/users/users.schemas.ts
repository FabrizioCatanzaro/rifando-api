import { z } from 'zod';

export const updateProfileSchema = z.object({
  display_name: z.string().max(100).optional(),
  whatsapp_number: z.string().max(20).optional(),
  profile_public: z.boolean().optional(),
  transfer_alias: z
    .string()
    .min(6, 'El alias debe tener al menos 6 caracteres')
    .max(20, 'El alias debe tener como máximo 20 caracteres')
    .regex(/^[A-Za-z0-9.\-]+$/, 'El alias solo admite letras (sin Ñ), números, puntos y guiones')
    .optional()
    .nullable(),
  transfer_holder: z.string().max(150).optional().nullable(),
  transfer_cuit: z.string().max(20).optional().nullable(),
  transfer_bank: z.string().max(100).optional().nullable(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
