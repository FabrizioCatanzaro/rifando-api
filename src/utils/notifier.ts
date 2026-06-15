import { env } from '../config/env';
import { db } from '../db/client';
import type { Promotion } from '../types/db';
import { notifyReservationEmail } from './mailer';

const priceFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
});

// Misma lógica que el frontend (src/lib/whatsapp.ts) para que el total
// del mensaje coincida con el precio final que ve el comprador.
function calculatePrice(
  count: number,
  pricePerNumber: number,
  promotions: Promotion[]
): { total: number; promotionLabel?: string } {
  const active = promotions.filter((p) => p.active);

  for (const promo of active) {
    if (count >= promo.quantity) {
      if (promo.type === 'pack' && promo.price !== null) {
        const packs = Math.floor(count / promo.quantity);
        const remaining = count % promo.quantity;
        const total = packs * promo.price + remaining * pricePerNumber;
        return { total, promotionLabel: promo.label };
      }
      if (promo.type === 'percentage' && promo.discount_percentage !== null) {
        const total = count * pricePerNumber * (1 - promo.discount_percentage / 100);
        return { total, promotionLabel: promo.label };
      }
      if (promo.type === 'bundle' && promo.free_numbers !== null) {
        const sets = Math.floor(count / promo.quantity);
        const free = sets * promo.free_numbers;
        const paid = count - free;
        return { total: paid * pricePerNumber, promotionLabel: promo.label };
      }
    }
  }

  return { total: count * pricePerNumber };
}

async function notifyReservationTelegram(
  chatId: string,
  raffleTitle: string,
  reserved: number[],
  buyerName: string,
  pricePerNumber: number,
  promotions: Promotion[]
) {
  if (!env.TELEGRAM_BOT_TOKEN) return;

  const plural = reserved.length > 1 ? 'Números' : 'Número';
  const { total, promotionLabel } = calculatePrice(reserved.length, pricePerNumber, promotions);

  let text =
    `🎟️ <b>Nueva reserva</b>\n\n` +
    `<b>Rifa:</b> ${raffleTitle}\n` +
    `<b>Comprador:</b> ${buyerName}\n` +
    `<b>${plural}:</b> ${reserved.join(', ')}\n` +
    `<b>Total:</b> ${priceFormatter.format(total)}`;

  if (promotionLabel) {
    text += `\n<b>Promoción:</b> ${promotionLabel}`;
  }

  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
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
    .select([
      'raffles.title',
      'raffles.price_per_number',
      'users.email',
      'users.telegram_chat_id',
    ])
    .where('raffles.id', '=', raffleId)
    .executeTakeFirst();

  if (!raffle) return;

  const tasks: Promise<unknown>[] = [
    notifyReservationEmail(raffle.title, raffle.email, reserved, buyerName),
  ];

  // Solo le mandamos a Telegram al dueño que vinculó su cuenta.
  if (raffle.telegram_chat_id) {
    const promotions = await db
      .selectFrom('promotions')
      .selectAll()
      .where('raffle_id', '=', raffleId)
      .execute();

    tasks.push(
      notifyReservationTelegram(
        raffle.telegram_chat_id,
        raffle.title,
        reserved,
        buyerName,
        raffle.price_per_number,
        promotions
      )
    );
  }

  await Promise.allSettled(tasks);
}
