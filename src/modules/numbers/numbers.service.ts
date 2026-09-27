import { db } from '../../db/client';
import { assertOwnComprobante } from '../../utils/comprobante';
import { AppError } from '../../middleware/errorHandler';
import { notifyReservation } from '../../utils/notifier';
import { maskBuyerName } from '../../utils/names';
import { calculatePrice, roundMoney, splitAmount } from '../../utils/pricing';
import type {
  ReserveInput,
  SellNumberInput,
  UpdateBuyerInput,
  BulkSellInput,
  BulkReleaseInput,
  ConfirmPurchaseInput,
} from './numbers.schemas';

export const RESERVATION_TTL_MS = 30 * 60 * 1000; // 30 minutos (sin comprobante)

/**
 * Libera reservas vencidas y marca sus compras como `expired`.
 * Las compras con comprobante tienen expires_at NULL y nunca vencen.
 */
async function expireStaleReservations(raffleId: string) {
  const now = new Date();

  await db
    .updateTable('purchases')
    .set({ status: 'expired', updated_at: now })
    .where('raffle_id', '=', raffleId)
    .where('status', '=', 'pending')
    .where('expires_at', 'is not', null)
    .where('expires_at', '<', now)
    .execute();

  const expired = await db
    .deleteFrom('number_reservations')
    .where('raffle_id', '=', raffleId)
    .where('expires_at', 'is not', null)
    .where('expires_at', '<', now)
    .returning(['number'])
    .execute();

  if (expired.length > 0) {
    await db
      .updateTable('raffle_numbers')
      .set({ status: 'available' })
      .where('raffle_id', '=', raffleId)
      .where('number', 'in', expired.map((r) => r.number))
      .where('status', '=', 'reserved')
      .execute();
  }
}

async function isRaffleOwner(raffleId: string, userId?: string) {
  if (!userId) return false;
  const raffle = await db
    .selectFrom('raffles')
    .select(['user_id'])
    .where('id', '=', raffleId)
    .executeTakeFirst();
  return raffle?.user_id === userId;
}

/**
 * Grilla de números. El dueño ve nombres completos, compra y monto.
 * El público ve solo "Nombre I." y el estado.
 */
export async function getNumbers(raffleId: string, viewerUserId?: string) {
  await expireStaleReservations(raffleId);
  const owner = await isRaffleOwner(raffleId, viewerUserId);

  const [numbers, reservations] = await Promise.all([
    db
      .selectFrom('raffle_numbers')
      .select(['number', 'status', 'buyer_name', 'sold_at', 'purchase_id', 'sale_amount'])
      .where('raffle_id', '=', raffleId)
      .orderBy('number', 'asc')
      .execute(),
    db
      .selectFrom('number_reservations')
      .select(['number', 'buyer_name', 'purchase_id'])
      .where('raffle_id', '=', raffleId)
      .execute(),
  ]);

  const reservationByNumber = new Map(reservations.map((r) => [r.number, r]));

  return numbers.map((n) => {
    const reservation = n.status === 'reserved' ? reservationByNumber.get(n.number) : undefined;
    const buyerName = n.buyer_name ?? reservation?.buyer_name ?? null;

    if (!owner) {
      return { number: n.number, status: n.status, buyer_name: maskBuyerName(buyerName), sold_at: n.sold_at };
    }
    return {
      ...n,
      buyer_name: buyerName,
      purchase_id: n.purchase_id ?? reservation?.purchase_id ?? null,
    };
  });
}

/**
 * Reserva todos los números pedidos o ninguno.
 * Crea una compra con el total real (promoción incluida).
 */
export async function reserveNumbers(raffleId: string, input: ReserveInput, ip?: string) {
  const raffle = await db
    .selectFrom('raffles')
    .select(['id', 'status', 'total_numbers', 'price_per_number', 'confirmation_method'])
    .where('id', '=', raffleId)
    .executeTakeFirst();

  if (!raffle) throw new AppError('Rifa no encontrada', 404);
  if (raffle.status !== 'active') throw new AppError('La rifa no está activa', 400);

  const numbers = [...new Set(input.numbers)].sort((a, b) => a - b);
  for (const n of numbers) {
    if (n < 0 || n >= raffle.total_numbers) throw new AppError(`Número ${n} fuera de rango`, 400);
  }

  if (raffle.confirmation_method === 'upload' && !input.comprobante_url) {
    throw new AppError('Adjuntá el comprobante de transferencia', 400);
  }
  if (input.comprobante_url) assertOwnComprobante(input.comprobante_url);

  await expireStaleReservations(raffleId);

  const promotions = await db
    .selectFrom('promotions')
    .selectAll()
    .where('raffle_id', '=', raffleId)
    .where('active', '=', true)
    .execute();

  const { total, promotionLabel } = calculatePrice(numbers.length, raffle.price_per_number, promotions);
  const comprobanteUrl = input.comprobante_url ?? null;
  // Con comprobante la reserva no vence: espera la decisión del rifante.
  const expiresAt = comprobanteUrl ? null : new Date(Date.now() + RESERVATION_TTL_MS);

  const result = await db.transaction().execute(async (trx) => {
    const available = await trx
      .selectFrom('raffle_numbers')
      .select(['id', 'number'])
      .where('raffle_id', '=', raffleId)
      .where('number', 'in', numbers)
      .where('status', '=', 'available')
      .forUpdate()
      .skipLocked()
      .execute();

    const availableSet = new Set(available.map((r) => r.number));
    const failed = numbers.filter((n) => !availableSet.has(n));
    if (failed.length > 0) return { purchaseId: null, failed };

    const purchase = await trx
      .insertInto('purchases')
      .values({
        raffle_id: raffleId,
        session_id: input.session_id,
        buyer_name: input.buyer_name,
        quantity: numbers.length,
        total: roundMoney(total),
        promotion_label: promotionLabel ?? null,
        comprobante_url: comprobanteUrl,
        expires_at: expiresAt,
        ip: ip ?? null,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();

    await trx
      .updateTable('raffle_numbers')
      .set({ status: 'reserved' })
      .where('id', 'in', available.map((r) => r.id))
      .execute();

    // Borra restos de reservas previas de esos números (ya estaban disponibles).
    await trx
      .deleteFrom('number_reservations')
      .where('raffle_id', '=', raffleId)
      .where('number', 'in', numbers)
      .execute();

    await trx
      .insertInto('number_reservations')
      .values(
        numbers.map((number) => ({
          raffle_id: raffleId,
          number,
          session_id: input.session_id,
          buyer_name: input.buyer_name,
          comprobante_url: comprobanteUrl,
          purchase_id: purchase.id,
          expires_at: expiresAt,
        }))
      )
      .execute();

    return { purchaseId: purchase.id, failed: [] as number[] };
  });

  if (!result.purchaseId) {
    return { reserved: [], failed: result.failed, purchase_id: null, total: 0, expires_at: null };
  }

  notifyReservation(result.purchaseId).catch(() => {});

  return {
    reserved: numbers,
    failed: [],
    purchase_id: result.purchaseId,
    total: roundMoney(total),
    promotion_label: promotionLabel ?? null,
    expires_at: expiresAt,
  };
}

/** El comprador cancela su propia reserva (identificado por session_id). */
export async function releaseReservation(raffleId: string, sessionId: string, numbers: number[]) {
  await db.transaction().execute(async (trx) => {
    const released = await trx
      .deleteFrom('number_reservations')
      .where('raffle_id', '=', raffleId)
      .where('session_id', '=', sessionId)
      .where('number', 'in', numbers)
      .returning(['number', 'purchase_id'])
      .execute();

    if (released.length === 0) return;

    await trx
      .updateTable('raffle_numbers')
      .set({ status: 'available' })
      .where('raffle_id', '=', raffleId)
      .where('number', 'in', released.map((r) => r.number))
      .where('status', '=', 'reserved')
      .execute();

    const purchaseIds = [...new Set(released.map((r) => r.purchase_id).filter((id): id is string => !!id))];
    if (purchaseIds.length > 0) {
      await trx
        .updateTable('purchases')
        .set({ status: 'cancelled', updated_at: new Date() })
        .where('id', 'in', purchaseIds)
        .where('status', '=', 'pending')
        .execute();
    }
  });
}

/** Compras pendientes de la rifa, con números, total real y comprobante. */
export async function getPendingPurchases(raffleId: string, userId: string) {
  await assertOwner(raffleId, userId);
  await expireStaleReservations(raffleId);

  const purchases = await db
    .selectFrom('purchases')
    .select([
      'id',
      'buyer_name',
      'quantity',
      'total',
      'promotion_label',
      'comprobante_url',
      'expires_at',
      'created_at',
    ])
    .where('raffle_id', '=', raffleId)
    .where('status', '=', 'pending')
    .orderBy('created_at', 'asc')
    .execute();

  if (purchases.length === 0) return [];

  const reservations = await db
    .selectFrom('number_reservations')
    .select(['purchase_id', 'number'])
    .where('purchase_id', 'in', purchases.map((p) => p.id))
    .orderBy('number', 'asc')
    .execute();

  const numbersByPurchase = new Map<string, number[]>();
  for (const r of reservations) {
    if (!r.purchase_id) continue;
    const list = numbersByPurchase.get(r.purchase_id) ?? [];
    list.push(r.number);
    numbersByPurchase.set(r.purchase_id, list);
  }

  return purchases
    .map((p) => ({ ...p, numbers: numbersByPurchase.get(p.id) ?? [] }))
    .filter((p) => p.numbers.length > 0);
}

async function getPendingPurchaseForOwner(raffleId: string, purchaseId: string, userId: string) {
  await assertOwner(raffleId, userId);
  const purchase = await db
    .selectFrom('purchases')
    .selectAll()
    .where('id', '=', purchaseId)
    .where('raffle_id', '=', raffleId)
    .executeTakeFirst();

  if (!purchase) throw new AppError('Compra no encontrada', 404);
  if (purchase.status !== 'pending') throw new AppError('La compra ya no está pendiente', 409);
  return purchase;
}

/** Confirma una compra: sus números pasan a `sold` con el monto real repartido. */
export async function confirmPurchase(
  raffleId: string,
  purchaseId: string,
  userId: string,
  input: ConfirmPurchaseInput
) {
  const purchase = await getPendingPurchaseForOwner(raffleId, purchaseId, userId);
  const buyerName = input.buyer_name ?? purchase.buyer_name;

  await db.transaction().execute(async (trx) => {
    const reservations = await trx
      .selectFrom('number_reservations')
      .select(['number'])
      .where('purchase_id', '=', purchaseId)
      .orderBy('number', 'asc')
      .execute();

    if (reservations.length === 0) throw new AppError('La reserva ya no existe', 409);

    // Si el rifante liberó números sueltos, el total se prorratea sobre los que quedan.
    const total =
      reservations.length === purchase.quantity
        ? purchase.total
        : roundMoney((purchase.total / purchase.quantity) * reservations.length);
    const amounts = splitAmount(total, reservations.length);
    const soldAt = new Date();

    for (let i = 0; i < reservations.length; i++) {
      await trx
        .updateTable('raffle_numbers')
        .set({
          status: 'sold',
          buyer_name: buyerName,
          sold_at: soldAt,
          purchase_id: purchaseId,
          sale_amount: amounts[i],
        })
        .where('raffle_id', '=', raffleId)
        .where('number', '=', reservations[i].number)
        .execute();
    }

    await trx.deleteFrom('number_reservations').where('purchase_id', '=', purchaseId).execute();
    await trx
      .updateTable('purchases')
      .set({ status: 'confirmed', buyer_name: buyerName, updated_at: soldAt })
      .where('id', '=', purchaseId)
      .execute();
  });
}

/** Rechaza una compra: sus números vuelven a estar disponibles. */
export async function rejectPurchase(raffleId: string, purchaseId: string, userId: string) {
  await getPendingPurchaseForOwner(raffleId, purchaseId, userId);

  await db.transaction().execute(async (trx) => {
    const released = await trx
      .deleteFrom('number_reservations')
      .where('purchase_id', '=', purchaseId)
      .returning(['number'])
      .execute();

    if (released.length > 0) {
      await trx
        .updateTable('raffle_numbers')
        .set({ status: 'available' })
        .where('raffle_id', '=', raffleId)
        .where('number', 'in', released.map((r) => r.number))
        .where('status', '=', 'reserved')
        .execute();
    }

    await trx
      .updateTable('purchases')
      .set({ status: 'rejected', updated_at: new Date() })
      .where('id', '=', purchaseId)
      .execute();
  });
}

/** Venta manual de un número (sin compra online): vale el precio unitario. */
export async function sellNumber(
  raffleId: string,
  userId: string,
  number: number,
  input: SellNumberInput
) {
  const raffle = await assertOwner(raffleId, userId);

  const updated = await db
    .updateTable('raffle_numbers')
    .set({
      status: 'sold',
      buyer_name: input.buyer_name,
      buyer_phone: input.buyer_phone ?? null,
      sold_at: new Date(),
      purchase_id: null,
      sale_amount: raffle.price_per_number,
    })
    .where('raffle_id', '=', raffleId)
    .where('number', '=', number)
    .returningAll()
    .executeTakeFirst();

  if (!updated) throw new AppError('Número no encontrado', 404);

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
    .set({
      status: 'available',
      buyer_name: null,
      buyer_phone: null,
      sold_at: null,
      purchase_id: null,
      sale_amount: null,
    })
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
    .select(['number', 'buyer_name', 'buyer_phone', 'sold_at', 'status', 'purchase_id', 'sale_amount'])
    .where('raffle_id', '=', raffleId)
    .where('status', 'in', ['sold', 'reserved'])
    .orderBy('number', 'asc')
    .execute();
}

/** Venta manual en lote (sin compra online): cada número vale el precio unitario. */
export async function bulkSell(raffleId: string, userId: string, input: BulkSellInput) {
  const raffle = await assertOwner(raffleId, userId);

  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable('raffle_numbers')
      .set({
        status: 'sold',
        buyer_name: input.buyer_name,
        sold_at: new Date(),
        purchase_id: null,
        sale_amount: raffle.price_per_number,
      })
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
      .set({
        status: 'available',
        buyer_name: null,
        buyer_phone: null,
        sold_at: null,
        purchase_id: null,
        sale_amount: null,
      })
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
    .select(['user_id', 'price_per_number'])
    .where('id', '=', raffleId)
    .executeTakeFirst();

  if (!raffle) throw new AppError('Rifa no encontrada', 404);
  if (raffle.user_id !== userId) throw new AppError('Sin permiso', 403);
  return raffle;
}
