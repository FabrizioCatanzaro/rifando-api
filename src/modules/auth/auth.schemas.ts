import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Email inválido'),
  username: z
    .string()
    .min(3, 'Mínimo 3 caracteres')
    .max(30, 'Máximo 30 caracteres')
    .regex(/^[a-z0-9_-]+$/, 'Solo letras minúsculas, números, guiones y guiones bajos'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  display_name: z.string().max(100).optional(),
  whatsapp_number: z
    .string()
    .min(7, 'Número inválido')
    .max(20)
    .regex(/^\+?[0-9\s\-().]+$/, 'Solo números y caracteres válidos'),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
