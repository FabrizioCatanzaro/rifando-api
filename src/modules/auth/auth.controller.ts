import type { Request, Response, NextFunction } from 'express';
import { registerSchema, loginSchema } from './auth.schemas';
import * as authService from './auth.service';
import { env } from '../../config/env';
import type { AuthRequest } from '../../middleware/auth';

const isProd = env.NODE_ENV === 'production';

const COOKIE_OPTS = {
  httpOnly: true,
  secure: isProd,
  sameSite: (isProd ? 'none' : 'strict') as 'none' | 'strict',
};

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const input = registerSchema.parse(req.body);
    const user = await authService.register(input);
    const { accessToken, refreshToken } = await authService.createTokenPair(
      user.id,
      user.username
    );

    res
      .cookie('access_token', accessToken, { ...COOKIE_OPTS, maxAge: 2 * 60 * 60 * 1000 })
      .cookie('refresh_token', refreshToken, { ...COOKIE_OPTS, maxAge: 7 * 24 * 60 * 60 * 1000 })
      .status(201)
      .json({ user });
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const input = loginSchema.parse(req.body);
    const user = await authService.login(input);
    const { accessToken, refreshToken } = await authService.createTokenPair(
      user.id,
      user.username
    );

    const { password_hash: _, ...safeUser } = user;
    const is_admin = !!(env.ADMIN_USER_ID && user.id === env.ADMIN_USER_ID);

    res
      .cookie('access_token', accessToken, { ...COOKIE_OPTS, maxAge: 2 * 60 * 60 * 1000 })
      .cookie('refresh_token', refreshToken, { ...COOKIE_OPTS, maxAge: 7 * 24 * 60 * 60 * 1000 })
      .json({ user: { ...safeUser, is_admin } });
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const refreshToken = req.cookies?.refresh_token as string | undefined;
    if (refreshToken) {
      await authService.revokeRefreshToken(refreshToken);
    }
    res
      .clearCookie('access_token', COOKIE_OPTS)
      .clearCookie('refresh_token', COOKIE_OPTS)
      .json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const rawRefreshToken = req.cookies?.refresh_token as string | undefined;
    if (!rawRefreshToken) {
      res.status(401).json({ error: 'No autenticado' });
      return;
    }

    const { accessToken, refreshToken } = await authService.refreshTokens(rawRefreshToken);

    res
      .cookie('access_token', accessToken, { ...COOKIE_OPTS, maxAge: 2 * 60 * 60 * 1000 })
      .cookie('refresh_token', refreshToken, { ...COOKIE_OPTS, maxAge: 7 * 24 * 60 * 60 * 1000 })
      .json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthRequest).userId;
    const user = await authService.getUserById(userId);
    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }
    res.json({ user });
  } catch (err) {
    next(err);
  }
}
