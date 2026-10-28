import { z } from 'zod';
import { formatCuit, normalizeAliasOrCbu, validateAliasOrCbu, validateCuit } from '../../utils/transfer';
import { usernameSchema } from '../auth/auth.schemas';

export const changeUsernameSchema = z.object({ username: usernameSchema });
export type ChangeUsernameInput = z.infer<typeof changeUsernameSchema>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    // undefined = no se envió (no se toca); vacío = se borra.
    .transform((v) => (v === undefined ? undefined : v || null));

export const updateProfileSchema = z
  .object({
    display_name: z.string().trim().min(1, 'El nombre completo es obligatorio').max(100).optional(),
    whatsapp_number: z.string().max(20).optional(),
    profile_public: z.boolean().optional(),
    transfer_alias: optionalText(30),
    transfer_holder: optionalText(150),
    transfer_cuit: optionalText(20),
    transfer_bank: optionalText(100),
  })
  .superRefine((data, ctx) => {
    // Los datos de transferencia se cargan completos o no se cargan.
    if (!data.transfer_alias) return;

    const aliasError = validateAliasOrCbu(data.transfer_alias);
    if (aliasError) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['transfer_alias'], message: aliasError });

    if (!data.transfer_holder) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['transfer_holder'], message: 'El titular es obligatorio' });
    }
    if (!data.transfer_bank) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['transfer_bank'], message: 'La entidad bancaria es obligatoria' });
    }
    if (!data.transfer_cuit) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['transfer_cuit'], message: 'El CUIT/CUIL es obligatorio' });
    } else {
      const cuitError = validateCuit(data.transfer_cuit);
      if (cuitError) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['transfer_cuit'], message: cuitError });
    }
  })
  .transform((data) => ({
    ...data,
    transfer_alias: data.transfer_alias ? normalizeAliasOrCbu(data.transfer_alias) : data.transfer_alias,
    transfer_cuit: data.transfer_cuit ? formatCuit(data.transfer_cuit) : data.transfer_cuit,
  }));

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
