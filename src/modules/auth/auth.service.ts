import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { db } from '../../db/client';
import { AppError } from '../../middleware/errorHandler';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/jwt';
import { env } from '../../config/env';
import type { RegisterInput, LoginInput } from './auth.schemas';

const BCRYPT_ROUNDS = 12;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function register(input: RegisterInput) {
  const existing = await db
    .selectFrom('users')
    .select('id')
    .where((eb) =>
      eb.or([eb('email', '=', input.email), eb('username', '=', input.username)])
    )
    .executeTakeFirst();

  if (existing) {
    throw new AppError('Email o nombre de usuario ya en uso', 409);
  }

  const password_hash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const user = await db
    .insertInto('users')
    .values({
      email: input.email,
      username: input.username,
      password_hash,
      display_name: input.display_name ?? null,
      whatsapp_number: input.whatsapp_number ?? null,
    })
    .returning(['id', 'email', 'username', 'display_name', 'avatar_url', 'whatsapp_number', 'profile_public'])
    .executeTakeFirstOrThrow();

  return user;
}

export async function login(input: LoginInput) {
  const user = await db
    .selectFrom('users')
    .selectAll()
    .where('email', '=', input.email)
    .executeTakeFirst();

  if (!user) {
    throw new AppError('Credenciales inválidas', 401);
  }

  const valid = await bcrypt.compare(input.password, user.password_hash);
  if (!valid) {
    throw new AppError('Credenciales inválidas', 401);
  }

  return user;
}

export async function createTokenPair(userId: string, username: string) {
  const accessToken = signAccessToken({ userId, username });

  const tokenId = nanoid();
  const refreshToken = signRefreshToken({ userId, tokenId });
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db
    .insertInto('refresh_tokens')
    .values({ user_id: userId, token_hash: tokenHash, expires_at: expiresAt })
    .execute();

  return { accessToken, refreshToken };
}

export async function refreshTokens(rawRefreshToken: string) {
  let payload: { userId: string; tokenId: string };
  try {
    payload = verifyRefreshToken(rawRefreshToken);
  } catch {
    throw new AppError('Token de refresco inválido', 401);
  }

  const tokenHash = hashToken(rawRefreshToken);
  const stored = await db
    .selectFrom('refresh_tokens')
    .selectAll()
    .where('token_hash', '=', tokenHash)
    .where('revoked', '=', false)
    .where('expires_at', '>', new Date())
    .executeTakeFirst();

  if (!stored) {
    throw new AppError('Token de refresco inválido o expirado', 401);
  }

  // Rotate: revoke old, issue new
  await db
    .updateTable('refresh_tokens')
    .set({ revoked: true })
    .where('id', '=', stored.id)
    .execute();

  const user = await db
    .selectFrom('users')
    .select(['id', 'username'])
    .where('id', '=', payload.userId)
    .executeTakeFirstOrThrow();

  return createTokenPair(user.id, user.username);
}

export async function revokeRefreshToken(rawRefreshToken: string) {
  const tokenHash = hashToken(rawRefreshToken);
  await db
    .updateTable('refresh_tokens')
    .set({ revoked: true })
    .where('token_hash', '=', tokenHash)
    .execute();
}

export async function getUserById(userId: string) {
  const user = await db
    .selectFrom('users')
    .select([
      'id',
      'email',
      'username',
      'display_name',
      'avatar_url',
      'whatsapp_number',
      'transfer_alias',
      'transfer_holder',
      'transfer_cuit',
      'transfer_bank',
      'profile_public',
      'created_at',
    ])
    .where('id', '=', userId)
    .executeTakeFirst();

  if (!user) return undefined;
  return { ...user, is_admin: !!(env.ADMIN_USER_ID && user.id === env.ADMIN_USER_ID) };
}
