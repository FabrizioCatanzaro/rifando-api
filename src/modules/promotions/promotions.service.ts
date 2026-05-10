import { db } from '../../db/client';
import { AppError } from '../../middleware/errorHandler';
import type { CreatePromotionInput, UpdatePromotionInput } from './promotions.schemas';

async function assertOwner(raffleId: string, userId: string) {
  const raffle = await db
    .selectFrom('raffles')
    .select(['user_id'])
    .where('id', '=', raffleId)
    .executeTakeFirst();
  if (!raffle) throw new AppError('Rifa no encontrada', 404);
  if (raffle.user_id !== userId) throw new AppError('Sin permiso', 403);
}

export async function getPromotions(raffleId: string) {
  return db
    .selectFrom('promotions')
    .selectAll()
    .where('raffle_id', '=', raffleId)
    .execute();
}

export async function createPromotion(raffleId: string, userId: string, input: CreatePromotionInput) {
  await assertOwner(raffleId, userId);
  return db
    .insertInto('promotions')
    .values({
      raffle_id: raffleId,
      type: input.type,
      label: input.label,
      quantity: input.quantity,
      price: input.price ?? null,
      discount_percentage: input.discount_percentage ?? null,
      free_numbers: input.free_numbers ?? null,
      active: input.active,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updatePromotion(
  raffleId: string,
  promotionId: string,
  userId: string,
  input: UpdatePromotionInput
) {
  await assertOwner(raffleId, userId);
  const updated = await db
    .updateTable('promotions')
    .set(input)
    .where('id', '=', promotionId)
    .where('raffle_id', '=', raffleId)
    .returningAll()
    .executeTakeFirst();
  if (!updated) throw new AppError('Promoción no encontrada', 404);
  return updated;
}

export async function deletePromotion(raffleId: string, promotionId: string, userId: string) {
  await assertOwner(raffleId, userId);
  await db
    .deleteFrom('promotions')
    .where('id', '=', promotionId)
    .where('raffle_id', '=', raffleId)
    .execute();
}
