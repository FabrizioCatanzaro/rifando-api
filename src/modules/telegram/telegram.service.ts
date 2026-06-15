import crypto from 'crypto';
import { db } from '../../db/client';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';

const LINK_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutos

const TELEGRAM_API = 'https://api.telegram.org';

async function callTelegram(method: string, body: Record<string, unknown>) {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  await fetch(`${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Genera un token de vinculación de un solo uso y devuelve el deep-link
 * que el usuario debe abrir para conectar su Telegram con el bot.
 */
export async function createLink(userId: string) {
  if (!env.TELEGRAM_BOT_USERNAME) {
    throw new AppError('La vinculación con Telegram no está configurada', 503);
  }

  const token = crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + LINK_TOKEN_TTL_MS);

  await db
    .updateTable('users')
    .set({
      telegram_link_token: token,
      telegram_link_expires_at: expiresAt,
      updated_at: new Date(),
    })
    .where('id', '=', userId)
    .execute();

  return {
    url: `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=${token}`,
    expires_at: expiresAt.toISOString(),
  };
}

export async function unlink(userId: string) {
  await db
    .updateTable('users')
    .set({
      telegram_chat_id: null,
      telegram_username: null,
      telegram_link_token: null,
      telegram_link_expires_at: null,
      updated_at: new Date(),
    })
    .where('id', '=', userId)
    .execute();
}

export async function getStatus(userId: string) {
  const user = await db
    .selectFrom('users')
    .select(['telegram_chat_id', 'telegram_username'])
    .where('id', '=', userId)
    .executeTakeFirst();

  return {
    linked: Boolean(user?.telegram_chat_id),
    username: user?.telegram_username ?? null,
  };
}

export interface TelegramUpdate {
  update_id?: number;
  message?: {
    chat?: { id: number };
    from?: { username?: string };
    text?: string;
  };
}

/**
 * Procesa un update entrante de Telegram. Solo nos interesa el comando
 * "/start <token>" que dispara el deep-link de vinculación.
 */
export async function handleUpdate(update: TelegramUpdate) {
  const message = update.message;
  const text = message?.text?.trim();
  const chatId = message?.chat?.id;

  if (!text || chatId === undefined) return;

  const match = text.match(/^\/start\s+(\S+)$/);
  if (!match) return;

  const token = match[1];

  const user = await db
    .selectFrom('users')
    .select(['id', 'telegram_link_expires_at'])
    .where('telegram_link_token', '=', token)
    .executeTakeFirst();

  if (!user || !user.telegram_link_expires_at || user.telegram_link_expires_at < new Date()) {
    await callTelegram('sendMessage', {
      chat_id: chatId,
      text: '⚠️ El enlace de vinculación es inválido o expiró. Generá uno nuevo desde tu perfil.',
    });
    return;
  }

  await db
    .updateTable('users')
    .set({
      telegram_chat_id: String(chatId),
      telegram_username: message?.from?.username ?? null,
      telegram_link_token: null,
      telegram_link_expires_at: null,
      updated_at: new Date(),
    })
    .where('id', '=', user.id)
    .execute();

  await callTelegram('sendMessage', {
    chat_id: chatId,
    text: '✅ ¡Listo! Tu cuenta quedó vinculada. Vas a recibir acá las notificaciones de tus rifas.',
  });
}
