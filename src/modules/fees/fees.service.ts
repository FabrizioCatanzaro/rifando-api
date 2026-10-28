import { sql } from 'kysely';
import { db } from '../../db/client';
import { AppError } from '../../middleware/errorHandler';
import { assertOwnComprobante } from '../../utils/comprobante';
import { appFeeAmount, getFeeConfig } from '../../utils/fees';
import { roundMoney } from '../../utils/pricing';
import { env } from '../../config/env';
import type { SubmitFeePaymentInput } from './fees.schemas';

export { getFeeConfig };

/**
 * Comisión de Rifando sobre las ventas manuales de una rifa.
 * - Recaudado total: suma de `sale_amount` de los números vendidos.
 * - Ventas con Mercado Pago: compras confirmadas con un pago aprobado. Su comisión ya la retuvo Mercado Pago.
 * - Base manual = recaudado − ventas con Mercado Pago.
 * - Pendiente = comisión de la base manual − pagos de comisión aprobados.
 */
export async function getFeeStatus(raffleId: string) {
  const raffle = await db
    .selectFrom('raffles')
    .select(['id', 'app_fee_percent'])
    .where('id', '=', raffleId)
    .executeTakeFirst();
  if (!raffle) throw new AppError('Rifa no encontrada', 404);

  const [revenueRow, mpRow, paidRow, pending] = await Promise.all([
    db
      .selectFrom('raffle_numbers')
      .select((eb) => eb.fn.coalesce(eb.fn.sum<number>('sale_amount'), eb.lit(0)).as('v'))
      .where('raffle_id', '=', raffleId)
      .where('status', '=', 'sold')
      .executeTakeFirstOrThrow(),
    db
      .selectFrom('purchases')
      .select((eb) => eb.fn.coalesce(eb.fn.sum<number>('total'), eb.lit(0)).as('v'))
      .where('raffle_id', '=', raffleId)
      .where('status', '=', 'confirmed')
      .where(({ exists, selectFrom }) =>
        exists(
          selectFrom('mercadopago_payments')
            .select(sql`1`.as('one'))
            .whereRef('mercadopago_payments.purchase_id', '=', 'purchases.id')
            .where('mercadopago_payments.status', '=', 'approved')
        )
      )
      .executeTakeFirstOrThrow(),
    db
      .selectFrom('raffle_fee_payments')
      .select((eb) => eb.fn.coalesce(eb.fn.sum<number>('amount'), eb.lit(0)).as('v'))
      .where('raffle_id', '=', raffleId)
      .where('status', '=', 'approved')
      .executeTakeFirstOrThrow(),
    db
      .selectFrom('raffle_fee_payments')
      .selectAll()
      .where('raffle_id', '=', raffleId)
      .where('status', '=', 'pending')
      .executeTakeFirst(),
  ]);

  const revenue = Number(revenueRow.v);
  const mpRevenue = Number(mpRow.v);
  const manualBase = roundMoney(Math.max(0, revenue - mpRevenue));
  const due = appFeeAmount(manualBase, raffle.app_fee_percent);
  const paid = Number(paidRow.v);

  return {
    fee_percent: raffle.app_fee_percent,
    revenue,
    mercadopago_revenue: mpRevenue,
    manual_revenue: manualBase,
    due,
    paid,
    remaining: roundMoney(Math.max(0, due - paid)),
    pending_payment: pending ?? null,
  };
}

/** Estado de la comisión para el dueño de la rifa, con la cuenta de Rifando donde transferir. */
export async function getFeePaymentInfo(raffleId: string, userId: string) {
  await assertOwner(raffleId, userId);

  const [status, history] = await Promise.all([
    getFeeStatus(raffleId),
    db
      .selectFrom('raffle_fee_payments')
      .selectAll()
      .where('raffle_id', '=', raffleId)
      .orderBy('created_at', 'desc')
      .execute(),
  ]);

  // Misma cuenta de Rifando que cobra el servicio de sorteo.
  const account = env.DRAW_SERVICE_ALIAS
    ? { alias: env.DRAW_SERVICE_ALIAS, holder: env.DRAW_SERVICE_HOLDER ?? null, bank: env.DRAW_SERVICE_BANK ?? null }
    : null;
  return { ...status, payments: history, account };
}

/** El rifante sube el comprobante de la comisión pendiente. El monto lo calcula la API. */
export async function submitFeePayment(raffleId: string, userId: string, input: SubmitFeePaymentInput) {
  const raffle = await assertOwner(raffleId, userId);
  if (raffle.status === 'draft') throw new AppError('La rifa todavía no está publicada', 400);
  assertOwnComprobante(input.comprobante_url);

  const status = await getFeeStatus(raffleId);
  if (status.pending_payment) throw new AppError('Ya hay un pago de comisión pendiente de verificación', 409);
  if (status.remaining <= 0) throw new AppError('No tenés comisión pendiente en esta rifa', 409);

  return db
    .insertInto('raffle_fee_payments')
    .values({
      raffle_id: raffleId,
      amount: status.remaining,
      base_amount: status.manual_revenue,
      fee_percent: status.fee_percent,
      comprobante_url: input.comprobante_url,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

/** Bloquea finalizar o sortear si queda comisión de ventas manuales sin pagar. */
export async function assertFeesSettled(raffleId: string) {
  const status = await getFeeStatus(raffleId);
  if (status.remaining <= 0) return;
  if (status.pending_payment) {
    throw new AppError('El pago de la comisión de Rifando está en revisión. Vas a poder finalizar cuando se apruebe.', 409);
  }
  throw new AppError('Pagá la comisión de Rifando por las ventas sin Mercado Pago antes de finalizar.', 409);
}

async function assertOwner(raffleId: string, userId: string) {
  const raffle = await db
    .selectFrom('raffles')
    .select(['id', 'user_id', 'status'])
    .where('id', '=', raffleId)
    .executeTakeFirst();
  if (!raffle) throw new AppError('Rifa no encontrada', 404);
  if (raffle.user_id !== userId) throw new AppError('Sin permiso', 403);
  return raffle;
}

// ─── Admin ────────────────────────────────────────────────────────────────

export async function listFeePayments() {
  return db
    .selectFrom('raffle_fee_payments')
    .innerJoin('raffles', 'raffles.id', 'raffle_fee_payments.raffle_id')
    .innerJoin('users', 'users.id', 'raffles.user_id')
    .selectAll('raffle_fee_payments')
    .select([
      'raffles.title as raffle_title',
      'raffles.slug as raffle_slug',
      'users.username as owner_username',
      'users.email as owner_email',
    ])
    .orderBy('raffle_fee_payments.created_at', 'desc')
    .execute();
}

export async function reviewFeePayment(paymentId: string, decision: 'approved' | 'rejected') {
  const updated = await db
    .updateTable('raffle_fee_payments')
    .set({ status: decision, reviewed_at: new Date() })
    .where('id', '=', paymentId)
    .where('status', '=', 'pending')
    .returning(['id'])
    .executeTakeFirst();

  if (!updated) {
    const exists = await db
      .selectFrom('raffle_fee_payments')
      .select('id')
      .where('id', '=', paymentId)
      .executeTakeFirst();
    throw new AppError(exists ? 'El pago ya fue revisado' : 'Pago no encontrado', exists ? 409 : 404);
  }
  return { ok: true };
}
