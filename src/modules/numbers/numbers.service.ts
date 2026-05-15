import { db } from '../../db/client';
import { AppError } from '../../middleware/errorHandler';
import type { ReserveInput, SellNumberInput, UpdateBuyerInput, BulkSellInput, BulkReleaseInput } from './numbers.schemas';

const RESERVATION_TTL_MS = 30 * 60 * 1000; // 30 minutes

async function cleanExpiredReservations(raffleId: string) {
  const expired = await db
    .deleteFrom('number_reservations')
    .where('raffle_id', '=', raffleId)
    .where('expires_at', '<', new Date())
    .returning(['number'])
    .execute();

  if (expired.length > 0) {
    const expiredNumbers = expired.map((r) => r.number);
    await db
      .updateTable('raffle_numbers')
      .set({ status: 'available' })
      .where('raffle_id', '=', raffleId)
      .where('number', 'in', expiredNumbers)
      .execute();
  }
}

export async function getNumbers(raffleId: string) {
  await cleanExpiredReservations(raffleId);

  const [numbers, reservations] = await Promise.all([
    db
      .selectFrom('raffle_numbers')
      .select(['number', 'status', 'buyer_name', 'sold_at'])
      .where('raffle_id', '=', raffleId)
      .orderBy('number', 'asc')
      .execute(),
    db
      .selectFrom('number_reservations')
      .select(['number', 'buyer_name'])
      .where('raffle_id', '=', raffleId)
      .where('expires_at', '>', new Date())
      .execute(),
  ]);

  const reservationNames = new Map(reservations.map((r) => [r.number, r.buyer_name]));

  return numbers.map((n) => ({
    ...n,
    buyer_name:
      n.buyer_name ??
      (n.status === 'reserved' ? (reservationNames.get(n.number) ?? null) : null),
  }));
}

export async function reserveNumbers(raffleId: string, input: ReserveInput) {
  const raffle = await db
    .selectFrom('raffles')
    .select(['id', 'status', 'total_numbers'])
    .where('id', '=', raffleId)
    .executeTakeFirst();

  if (!raffle) throw new AppError('Rifa no encontrada', 404);
  if (raffle.status !== 'active') throw new AppError('La rifa no está activa', 400);

  // Validate numbers are in range
  for (const n of input.numbers) {
    if (n < 0 || n >= raffle.total_numbers) {
      throw new AppError(`Número ${n} fuera de rango`, 400);
    }
  }

  await cleanExpiredReservations(raffleId);

  const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);
  const reserved: number[] = [];
  const failed: number[] = [];

  // Use a transaction with FOR UPDATE to prevent race conditions
  await db.transaction().execute(async (trx) => {
    for (const number of input.numbers) {
      const row = await trx
        .selectFrom('raffle_numbers')
        .select(['id', 'status'])
        .where('raffle_id', '=', raffleId)
        .where('number', '=', number)
        .where('status', '=', 'available')
        .forUpdate()
        .skipLocked()
        .executeTakeFirst();

      if (!row) {
        failed.push(number);
        continue;
      }

      await trx
        .updateTable('raffle_numbers')
        .set({ status: 'reserved' })
        .where('id', '=', row.id)
        .execute();

      await trx
        .insertInto('number_reservations')
        .values({
          raffle_id: raffleId,
          number,
          session_id: input.session_id,
          buyer_name: input.buyer_name ?? null,
          expires_at: expiresAt,
        })
        .onConflict((oc) =>
          oc.columns(['raffle_id', 'number']).doUpdateSet({
            session_id: input.session_id,
            buyer_name: input.buyer_name ?? null,
            expires_at: expiresAt,
          })
        )
        .execute();

      reserved.push(number);
    }
  });

  return { reserved, failed, expires_at: expiresAt };
}

export async function releaseReservation(raffleId: string, sessionId: string, numbers: number[]) {
  await db.transaction().execute(async (trx) => {
    await trx
      .deleteFrom('number_reservations')
      .where('raffle_id', '=', raffleId)
      .where('session_id', '=', sessionId)
      .where('number', 'in', numbers)
      .execute();

    await trx
      .updateTable('raffle_numbers')
      .set({ status: 'available' })
      .where('raffle_id', '=', raffleId)
      .where('number', 'in', numbers)
      .where('status', '=', 'reserved')
      .execute();
  });
}

export async function sellNumber(
  raffleId: string,
  userId: string,
  number: number,
  input: SellNumberInput
) {
  await assertOwner(raffleId, userId);

  const updated = await db
    .updateTable('raffle_numbers')
    .set({
      status: 'sold',
      buyer_name: input.buyer_name,
      buyer_phone: input.buyer_phone ?? null,
      sold_at: new Date(),
    })
    .where('raffle_id', '=', raffleId)
    .where('number', '=', number)
    .returningAll()
    .executeTakeFirst();

  if (!updated) throw new AppError('Número no encontrado', 404);

  // Remove reservation if any
  await db
    .deleteFrom('number_reservations')
    .where('raffle_id', '=', raffleId)
    .where('number', '=', number)
    .execute();

  return updated;
}

export async function releaseNumber(raffleId: string, userId: string, number: number) {
  await assertOwner(raffleId, userId);

  await db
    .updateTable('raffle_numbers')
    .set({ status: 'available', buyer_name: null, buyer_phone: null, sold_at: null })
    .where('raffle_id', '=', raffleId)
    .where('number', '=', number)
    .execute();

  await db
    .deleteFrom('number_reservations')
    .where('raffle_id', '=', raffleId)
    .where('number', '=', number)
    .execute();
}

export async function updateBuyer(
  raffleId: string,
  userId: string,
  number: number,
  input: UpdateBuyerInput
) {
  await assertOwner(raffleId, userId);

  const updated = await db
    .updateTable('raffle_numbers')
    .set({ buyer_name: input.buyer_name, buyer_phone: input.buyer_phone ?? null })
    .where('raffle_id', '=', raffleId)
    .where('number', '=', number)
    .returningAll()
    .executeTakeFirst();

  if (!updated) throw new AppError('Número no encontrado', 404);
  return updated;
}

export async function getBuyers(raffleId: string, userId: string) {
  await assertOwner(raffleId, userId);

  return db
    .selectFrom('raffle_numbers')
    .select(['number', 'buyer_name', 'buyer_phone', 'sold_at', 'status'])
    .where('raffle_id', '=', raffleId)
    .where('status', 'in', ['sold', 'reserved'])
    .orderBy('number', 'asc')
    .execute();
}

export async function bulkSell(raffleId: string, userId: string, input: BulkSellInput) {
  await assertOwner(raffleId, userId);

  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable('raffle_numbers')
      .set({ status: 'sold', buyer_name: input.buyer_name, sold_at: new Date() })
      .where('raffle_id', '=', raffleId)
      .where('number', 'in', input.numbers)
      .execute();

    await trx
      .deleteFrom('number_reservations')
      .where('raffle_id', '=', raffleId)
      .where('number', 'in', input.numbers)
      .execute();
  });
}

export async function bulkRelease(raffleId: string, userId: string, input: BulkReleaseInput) {
  await assertOwner(raffleId, userId);

  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable('raffle_numbers')
      .set({ status: 'available', buyer_name: null, buyer_phone: null, sold_at: null })
      .where('raffle_id', '=', raffleId)
      .where('number', 'in', input.numbers)
      .execute();

    await trx
      .deleteFrom('number_reservations')
      .where('raffle_id', '=', raffleId)
      .where('number', 'in', input.numbers)
      .execute();
  });
}

async function assertOwner(raffleId: string, userId: string) {
  const raffle = await db
    .selectFrom('raffles')
    .select(['user_id'])
    .where('id', '=', raffleId)
    .executeTakeFirst();

  if (!raffle) throw new AppError('Rifa no encontrada', 404);
  if (raffle.user_id !== userId) throw new AppError('Sin permiso', 403);
}
