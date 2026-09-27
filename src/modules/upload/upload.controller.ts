import type { Request, Response, NextFunction } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

const MAX_COMPROBANTE_BYTES = 5 * 1024 * 1024; // 5 MB

/** Tamaño aproximado en bytes de un data URI base64. */
function dataUriBytes(dataUri: string): number {
  const base64 = dataUri.slice(dataUri.indexOf(',') + 1);
  return Math.floor((base64.length * 3) / 4);
}

/** Comprobante de transferencia: imagen o PDF, hasta 5 MB. */
export async function uploadComprobante(req: Request, res: Response, next: NextFunction) {
  try {
    const { data } = req.body as { data?: string };

    if (!data) throw new AppError('Adjuntá el comprobante', 400);
    const isImage = data.startsWith('data:image/');
    const isPdf = data.startsWith('data:application/pdf');
    if (!isImage && !isPdf) throw new AppError('El comprobante debe ser una imagen o un PDF', 400);
    if (dataUriBytes(data) > MAX_COMPROBANTE_BYTES) {
      throw new AppError('El comprobante supera los 5 MB', 400);
    }

    // Cloudinary guarda los PDF como resource_type "image". Sin transformación para no rasterizarlos.
    const result = await cloudinary.uploader.upload(data, {
      folder: 'rifando/comprobantes',
      resource_type: 'image',
      ...(isImage && {
        transformation: [{ quality: 'auto', fetch_format: 'auto', width: 1600, crop: 'limit' }],
      }),
    });

    res.json({ url: result.secure_url });
  } catch (err) {
    next(err);
  }
}

export async function uploadImage(req: Request, res: Response, next: NextFunction) {
  try {
    const { data, folder } = req.body as { data?: string; folder?: string };

    if (!data) throw new AppError('Se requiere imagen en base64', 400);

    // Validate it's a real base64 image (data URI)
    if (!data.startsWith('data:image/')) {
      throw new AppError('Formato de imagen inválido', 400);
    }

    const result = await cloudinary.uploader.upload(data, {
      folder: `rifando/${folder ?? 'general'}`,
      transformation: [{ quality: 'auto', fetch_format: 'auto', width: 1200, crop: 'limit' }],
    });

    res.json({ url: result.secure_url, public_id: result.public_id });
  } catch (err) {
    next(err);
  }
}
