import { z } from 'zod';

// Usernames que chocan con rutas de primer nivel del frontend (/[username]).
export const RESERVED_USERNAMES = new Set([
  'admin', 'api', 'app', 'auth', 'ayuda', 'contacto', 'dashboard', 'help', 'login',
  'logout', 'privacidad', 'register', 'registro', 'rifando', 'settings', 'soporte',
  'static', 'terminos', 'www', '_next',
]);

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Mínimo 3 caracteres')
  .max(30, 'Máximo 30 caracteres')
  .regex(/^[a-z0-9_-]+$/, 'Solo letras minúsculas, números, guiones y guiones bajos')
  .refine((u) => !RESERVED_USERNAMES.has(u), 'Ese nombre de usuario no está disponible');

export const registerSchema = z.object({
  email: z.string().email('Email inválido'),
  username: usernameSchema,
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  display_name: z.string().trim().min(1, 'El nombre completo es obligatorio').max(100),
  whatsapp_number: z
    .string()
    .min(7, 'Número inválido')
    .max(20)
    .regex(/^\+?[0-9\s\-().]+$/, 'Solo números y caracteres válidos')
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
