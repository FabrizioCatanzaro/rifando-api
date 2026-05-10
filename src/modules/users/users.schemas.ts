import { z } from 'zod';

export const updateProfileSchema = z.object({
  display_name: z.string().max(100).optional(),
  whatsapp_number: z.string().max(20).optional(),
  profile_public: z.boolean().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
