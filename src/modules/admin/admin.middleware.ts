import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../middleware/errorHandler';
import { env } from '../../config/env';
import type { AuthRequest } from '../../middleware/auth';

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const userId = (req as AuthRequest).userId;
  if (!env.ADMIN_USER_ID || userId !== env.ADMIN_USER_ID) {
    return next(new AppError('Acceso denegado', 403));
  }
  next();
}
