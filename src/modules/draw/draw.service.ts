import { db } from '../../db/client';
import { AppError } from '../../middleware/errorHandler';
import type { SubmitDrawPaymentInput, ExecuteDrawInput } from './draw.schemas';

export async function submitDrawPayment(raffleId: string, userId: string, input: SubmitDrawPaymentInput) {
  const raffle = await db
    .selectFrom('raffles')
    .select(['id', 'user_id', 'status', 'draw_unlocked'])
    .where('id', '=', raffleId)
    .executeTakeFirst();

  if (!raffle) throw new AppError('Rifa no encontrada', 404);
  if (raffle.user_id !== userId) throw new AppError('Sin permiso', 403);
  if (raffle.status !== 'active') throw new AppError('La rifa debe estar activa', 400);
  if (raffle.draw_unlocked) throw new AppError('El sorteo ya está habilitado para esta rifa', 409);

  const existing = await db
    .selectFrom('raffle_draw_payments')
    .select('status')
    .where('raffle_id', '=', raffleId)
    .where('status', '=', 'pending')
    .executeTakeFirst();

  if (existing) throw new AppError('Ya hay un pago pendiente de verificación', 409);

  const payment = await db
    .insertInto('raffle_draw_payments')
    .values({ raffle_id: raffleId, comprobante_url: input.comprobante_url })
    .returningAll()
    .executeTakeFirstOrThrow();

  return payment;
}

export async function getDrawPayment(raffleId: string, userId: string) {
  const raffle = await db
    .selectFrom('raffles')
    .select(['user_id', 'draw_unlocked'])
    .where('id', '=', raffleId)
    .executeTakeFirst();

  if (!raffle) throw new AppError('Rifa no encontrada', 404);
  if (raffle.user_id !== userId) throw new AppError('Sin permiso', 403);

  const payment = await db
    .selectFrom('raffle_draw_payments')
    .selectAll()
    .where('raffle_id', '=', raffleId)
    .orderBy('created_at', 'desc')
    .executeTakeFirst();

  return { draw_unlocked: raffle.draw_unlocked, payment: payment ?? null };
}

export async function executeDraw(raffleId: string, userId: string, input: ExecuteDrawInput) {
  const raffle = await db
    .selectFrom('raffles')
    .select(['id', 'user_id', 'status', 'total_numbers', 'draw_unlocked'])
    .where('id', '=', raffleId)
    .executeTakeFirst();

  if (!raffle) throw new AppError('Rifa no encontrada', 404);
  if (raffle.user_id !== userId) throw new AppError('Sin permiso', 403);
  if (!raffle.draw_unlocked) throw new AppError('El sorteo automático no está habilitado para esta rifa', 403);
  if (raffle.status !== 'active') throw new AppError('La rifa debe estar activa para sortear', 400);

  const prizes = await db
    .selectFrom('prizes')
    .select(['id', 'position'])
    .where('raffle_id', '=', raffleId)
    .orderBy('position', 'asc')
    .execute();

  // Fetch sold numbers with buyer info for buyer-dedup logic
  const soldNumbers = await db
    .selectFrom('raffle_numbers')
    .select(['number', 'buyer_name'])
    .where('raffle_id', '=', raffleId)
    .where('status', '=', 'sold')
    .execute();

  const buyerByNumber = new Map<number, string | null>(
    soldNumbers.map((n) => [n.number, n.buyer_name])
  );

  let pool: number[];
  if (input.mode === 'sold') {
    pool = soldNumbers.map((n) => n.number);
    if (pool.length === 0) throw new AppError('No hay números vendidos para sortear', 400);
  } else {
    pool = Array.from({ length: raffle.total_numbers }, (_, i) => i);
  }

  const prizeCount = prizes.length || 1;

  // Shuffle pool (Fisher-Yates)
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }

  let winners: number[];
  if (input.allow_repeat) {
    // Same buyer can win multiple prizes — just take the first prizeCount unique numbers
    if (shuffled.length < prizeCount) {
      throw new AppError(`No hay suficientes números en el pool para ${prizeCount} premio(s)`, 400);
    }
    winners = shuffled.slice(0, prizeCount);
  } else {
    // Same buyer can only win one prize — skip numbers whose buyer already won
    const wonBuyers = new Set<string>();
    winners = [];
    for (const num of shuffled) {
      if (winners.length >= prizeCount) break;
      const buyer = buyerByNumber.get(num) ?? null;
      if (buyer && wonBuyers.has(buyer)) continue;
      winners.push(num);
      if (buyer) wonBuyers.add(buyer);
    }
    if (winners.length < prizeCount) {
      throw new AppError(
        `No hay suficientes compradores únicos para ${prizeCount} premio(s). Activá "permitir repetición" para continuar.`,
        400
      );
    }
  }

  if (prizes.length > 0) {
    for (let i = 0; i < prizes.length; i++) {
      await db
        .updateTable('prizes')
        .set({ winner_number: winners[i] })
        .where('id', '=', prizes[i]!.id)
        .execute();
    }
  }

  const updated = await db
    .updateTable('raffles')
    .set({ status: 'finished', winner_number: winners[0], updated_at: new Date() })
    .where('id', '=', raffleId)
    .returningAll()
    .executeTakeFirstOrThrow();

  return { raffle: updated, winners };
}
