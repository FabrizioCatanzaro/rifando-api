import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos. Esperá un minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Demasiadas solicitudes.' },
  standardHeaders: true,
  legacyHeaders: false,
});
