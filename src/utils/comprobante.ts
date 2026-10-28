import { env } from '../config/env';
import { AppError } from '../middleware/errorHandler';

/** true si la URL pertenece a nuestro Cloudinary. */
export function isOwnCloudinaryUrl(url: string): boolean {
  return url.startsWith(`https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/`);
}

/** Acepta solo comprobantes subidos a nuestro Cloudinary (vía /api/upload/comprobante). */
export function assertOwnComprobante(url: string) {
  if (!isOwnCloudinaryUrl(url)) throw new AppError('Comprobante inválido', 400);
}
