import { env } from '../config/env';
import { db } from '../db/client';
import { escapeHtml } from './html';
import {
  notifyMercadoPagoPaymentEmail,
  notifyReservationEmail,
  type MercadoPagoPaymentNotice,
  type ReservationEmailData,
} from './mailer';

const priceFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
});

export function formatPrice(value: number): string {
  return priceFormatter.format(value);
}

async function notifyReservationTelegram(chatId: string, data: ReservationEmailData) {
  if (!env.TELEGRAM_BOT_TOKEN) return;

  const plural = data.numbers.length > 1 ? 'Números' : 'Número';

  let text =
    `🎟️ <b>Nueva reserva</b>\n\n` +
    `<b>Rifa:</b> ${escapeHtml(data.raffleTitle)}\n` +
    `<b>Comprador:</b> ${escapeHtml(data.buyerName)}\n` +
    `<b>${plural}:</b> ${data.numbers.join(', ')}\n` +
    `<b>Total:</b> ${formatPrice(data.total)}`;

  if (data.promotionLabel) text += `\n<b>Promoción:</b> ${escapeHtml(data.promotionLabel)}`;

  if (data.comprobanteUrl) {
    text += `\n\n📎 <a href="${escapeHtml(data.comprobanteUrl)}">Ver comprobante</a>`;
    text += `\nLa reserva no vence hasta que la confirmes o rechaces.`;
  } else {
    text += `\n\n⏱️ La reserva vence en 30 minutos si no la confirmás.`;
  }

  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

/** Avisa al rifante por email y Telegram (si lo vinculó) que entró una compra. */
export async function notifyReservation(purchaseId: string) {
  const row = await db
    .selectFrom('purchases')
    .innerJoin('raffles', 'raffles.id', 'purchases.raffle_id')
    .innerJoin('users', 'users.id', 'raffles.user_id')
    .select([
      'purchases.buyer_name',
      'purchases.total',
      'purchases.promotion_label',
      'purchases.comprobante_url',
      'raffles.id as raffle_id',
      'raffles.title',
      'users.email',
      'users.telegram_chat_id',
    ])
    .where('purchases.id', '=', purchaseId)
    .executeTakeFirst();

  if (!row) return;

  const reservations = await db
    .selectFrom('number_reservations')
    .select(['number'])
    .where('purchase_id', '=', purchaseId)
    .orderBy('number', 'asc')
    .execute();

  const data: ReservationEmailData = {
    raffleId: row.raffle_id,
    raffleTitle: row.title,
    buyerName: row.buyer_name,
    numbers: reservations.map((r) => r.number),
    total: row.total,
    promotionLabel: row.promotion_label,
    comprobanteUrl: row.comprobante_url,
  };

  const tasks: Promise<unknown>[] = [notifyReservationEmail(row.email, data)];
  if (row.telegram_chat_id) tasks.push(notifyReservationTelegram(row.telegram_chat_id, data));

  await Promise.allSettled(tasks);
}

async function notifyMercadoPagoPaymentTelegram(chatId: string, data: MercadoPagoPaymentNotice) {
  if (!env.TELEGRAM_BOT_TOKEN) return;

  const net = data.netAmount !== null ? ` (neto ${formatPrice(data.netAmount)})` : '';
  let text =
    data.kind === 'approved' ? `💸 <b>Pago recibido por Mercado Pago</b>\n\n` : `⚠️ <b>Pago de Mercado Pago para revisar</b>\n\n`;
  text +=
    `<b>Rifa:</b> ${escapeHtml(data.raffleTitle)}\n` +
    `<b>Comprador:</b> ${escapeHtml(data.buyerName)}\n` +
    `<b>Monto:</b> ${formatPrice(data.amount)}${net}`;

  if (data.kind === 'approved') {
    text += `\n<b>Números vendidos:</b> ${data.numbers.join(', ')}`;
  } else if (data.kind === 'late') {
    text += `\n\nLa reserva ya había vencido, se había cancelado o la rifa ya no está activa. Asigná números a mano o devolvé el dinero (pago N° ${data.paymentId}).`;
  } else if (data.kind === 'mismatch') {
    text += `\n\nEl monto no cubre el total. La compra sigue pendiente (pago N° ${data.paymentId}).`;
  } else if (data.kind === 'duplicate') {
    text += `\n\nLa compra ya estaba confirmada. Es un pago doble: devolvé el dinero (pago N° ${data.paymentId}).`;
  } else {
    text += `\n<b>Números:</b> ${data.numbers.join(', ')}\n\nMercado Pago devolvió o contracargó el pago. Los números siguen vendidos: liberalos si corresponde (pago N° ${data.paymentId}).`;
  }

  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

/** Avisa al rifante por email y Telegram (si lo vinculó) que entró un pago de Mercado Pago. */
export async function notifyMercadoPagoPayment(ownerUserId: string, data: MercadoPagoPaymentNotice) {
  const owner = await db
    .selectFrom('users')
    .select(['email', 'telegram_chat_id'])
    .where('id', '=', ownerUserId)
    .executeTakeFirst();
  if (!owner) return;

  const tasks: Promise<unknown>[] = [notifyMercadoPagoPaymentEmail(owner.email, data)];
  if (owner.telegram_chat_id) tasks.push(notifyMercadoPagoPaymentTelegram(owner.telegram_chat_id, data));

  await Promise.allSettled(tasks);
}
