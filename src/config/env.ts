import { z } from 'zod';

// Una variable vacía en .env ("FOO=") cuenta como no definida.
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  FRONTEND_URL: z.string().url(),
  RESEND_API_KEY: optional(z.string().min(1)),
  RESEND_FROM: optional(z.string().min(1)),
  TELEGRAM_BOT_TOKEN: optional(z.string().min(1)),
  TELEGRAM_CHAT_ID: optional(z.string().min(1)),
  TELEGRAM_BOT_USERNAME: optional(z.string().min(1)),
  TELEGRAM_WEBHOOK_SECRET: optional(z.string().min(1)),
  ADMIN_USER_ID: optional(z.string()),
  // Servicio de sorteo automático: precio y cuenta del dueño de la app para cobrarlo.
  DRAW_SERVICE_PRICE: optional(z.coerce.number().positive()),
  DRAW_SERVICE_ALIAS: optional(z.string().min(1)),
  DRAW_SERVICE_HOLDER: optional(z.string().min(1)),
  DRAW_SERVICE_BANK: optional(z.string().min(1)),
  // Registro de cuentas nuevas. Por defecto cerrado (acceso anticipado).
  REGISTRATION_OPEN: z
    .preprocess((v) => (v === '' ? undefined : v), z.enum(['true', 'false']).default('false'))
    .transform((v) => v === 'true'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
