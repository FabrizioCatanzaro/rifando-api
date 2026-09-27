import { env } from '../config/env';
import { AppError } from '../middleware/errorHandler';

/** Acepta solo comprobantes subidos a nuestro Cloudinary (vía /api/upload/comprobante). */
export function assertOwnComprobante(url: string) {
  const prefix = `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/`;
  if (!url.startsWith(prefix)) throw new AppError('Comprobante inválido', 400);
}
