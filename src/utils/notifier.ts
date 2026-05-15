import { env } from '../config/env';
import { db } from '../db/client';
import { notifyReservationEmail } from './mailer';

async function notifyReservationTelegram(
  raffleTitle: string,
  reserved: number[],
  buyerName: string
) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;

  const plural = reserved.length > 1 ? 'Números' : 'Número';
  const text =
    `🎟️ <b>Nueva reserva</b>\n\n` +
    `<b>Rifa:</b> ${raffleTitle}\n` +
    `<b>Comprador:</b> ${buyerName}\n` +
    `<b>${plural}:</b> ${reserved.join(', ')}`;

  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' }),
  });
}

export async function notifyReservation(
  raffleId: string,
  reserved: number[],
  buyerName: string
) {
  const raffle = await db
    .selectFrom('raffles')
    .innerJoin('users', 'users.id', 'raffles.user_id')
    .select(['raffles.title', 'users.email'])
    .where('raffles.id', '=', raffleId)
    .executeTakeFirst();

  if (!raffle) return;

  await Promise.allSettled([
    notifyReservationTelegram(raffle.title, reserved, buyerName),
    notifyReservationEmail(raffle.title, raffle.email, reserved, buyerName),
  ]);
}
