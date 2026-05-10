import { v2 as cloudinary } from 'cloudinary';
import { db } from '../../db/client';
import { AppError } from '../../middleware/errorHandler';
import { env } from '../../config/env';
import type { CreatePrizeInput, UpdatePrizeInput } from './prizes.schemas';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

function extractPublicId(url: string): string | null {
  // Cloudinary URLs look like: https://res.cloudinary.com/<cloud>/image/upload/v123/<folder>/<public_id>.<ext>
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.\w+$/);
  return match ? match[1] : null;
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

export async function getPrizes(raffleId: string) {
  return db
    .selectFrom('prizes')
    .selectAll()
    .where('raffle_id', '=', raffleId)
    .orderBy('position', 'asc')
    .execute();
}

export async function createPrize(raffleId: string, userId: string, input: CreatePrizeInput) {
  await assertOwner(raffleId, userId);
  return db
    .insertInto('prizes')
    .values({ raffle_id: raffleId, ...input, description: input.description ?? null, image_url: input.image_url ?? null })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updatePrize(
  raffleId: string,
  prizeId: string,
  userId: string,
  input: UpdatePrizeInput
) {
  await assertOwner(raffleId, userId);
  const updated = await db
    .updateTable('prizes')
    .set(input)
    .where('id', '=', prizeId)
    .where('raffle_id', '=', raffleId)
    .returningAll()
    .executeTakeFirst();
  if (!updated) throw new AppError('Premio no encontrado', 404);
  return updated;
}

export async function deletePrize(raffleId: string, prizeId: string, userId: string) {
  await assertOwner(raffleId, userId);
  const prize = await db
    .selectFrom('prizes')
    .select(['image_url'])
    .where('id', '=', prizeId)
    .where('raffle_id', '=', raffleId)
    .executeTakeFirst();

  await db
    .deleteFrom('prizes')
    .where('id', '=', prizeId)
    .where('raffle_id', '=', raffleId)
    .execute();

  if (prize?.image_url) {
    const publicId = extractPublicId(prize.image_url);
    if (publicId) {
      cloudinary.uploader.destroy(publicId).catch(() => {/* non-critical */});
    }
  }
}
