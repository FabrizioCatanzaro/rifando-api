import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';

export interface AuthRequest extends Request {
  userId: string;
  username: string;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.access_token as string | undefined;

  if (!token) {
    res.status(401).json({ error: 'No autenticado' });
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    (req as AuthRequest).userId = payload.userId;
    (req as AuthRequest).username = payload.username;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}
