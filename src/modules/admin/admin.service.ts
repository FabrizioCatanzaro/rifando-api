import { db } from '../../db/client';
import { AppError } from '../../middleware/errorHandler';

export async function listDrawPayments() {
  const payments = await db
    .selectFrom('raffle_draw_payments')
    .selectAll()
    .orderBy('created_at', 'desc')
    .execute();

  const enriched = await Promise.all(
    payments.map(async (p) => {
      const raffle = await db
        .selectFrom('raffles')
        .select(['title', 'slug', 'user_id'])
        .where('id', '=', p.raffle_id)
        .executeTakeFirst();

      const owner = raffle
        ? await db
            .selectFrom('users')
            .select(['username', 'email'])
            .where('id', '=', raffle.user_id)
            .executeTakeFirst()
        : undefined;

      return {
        ...p,
        raffle_title: raffle?.title ?? '',
        raffle_slug: raffle?.slug ?? '',
        owner_username: owner?.username ?? '',
        owner_email: owner?.email ?? '',
      };
    })
  );

  return enriched;
}

export async function approveDrawPayment(paymentId: string) {
  const payment = await db
    .selectFrom('raffle_draw_payments')
    .select(['id', 'raffle_id', 'status'])
    .where('id', '=', paymentId)
    .executeTakeFirst();

  if (!payment) throw new AppError('Pago no encontrado', 404);
  if (payment.status !== 'pending') throw new AppError('El pago ya fue revisado', 409);

  await db
    .updateTable('raffle_draw_payments')
    .set({ status: 'approved', reviewed_at: new Date() })
    .where('id', '=', paymentId)
    .execute();

  await db
    .updateTable('raffles')
    .set({ draw_unlocked: true, updated_at: new Date() })
    .where('id', '=', payment.raffle_id)
    .execute();

  return { ok: true };
}

export async function rejectDrawPayment(paymentId: string) {
  const payment = await db
    .selectFrom('raffle_draw_payments')
    .select(['id', 'status'])
    .where('id', '=', paymentId)
    .executeTakeFirst();

  if (!payment) throw new AppError('Pago no encontrado', 404);
  if (payment.status !== 'pending') throw new AppError('El pago ya fue revisado', 409);

  await db
    .updateTable('raffle_draw_payments')
    .set({ status: 'rejected', reviewed_at: new Date() })
    .where('id', '=', paymentId)
    .execute();

  return { ok: true };
}
