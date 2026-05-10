import type { Request, Response, NextFunction } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

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
