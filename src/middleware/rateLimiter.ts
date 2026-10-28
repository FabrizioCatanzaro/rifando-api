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

// Reservas públicas: evita que un visitante bloquee toda la grilla.
export const reserveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Hiciste muchas reservas. Probá de nuevo en una hora.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Subida pública de comprobantes: evita abuso del almacenamiento en Cloudinary.
export const uploadComprobanteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Subiste muchos comprobantes. Probá de nuevo en una hora.' },
  standardHeaders: true,
  legacyHeaders: false,
});
