import { v2 as cloudinary } from 'cloudinary';
import { db } from '../../db/client';
import { AppError } from '../../middleware/errorHandler';
import { generateSlug } from '../../utils/slug';
import { env } from '../../config/env';
import type { CreateRaffleInput, UpdateRaffleInput, FinishRaffleInput } from './raffles.schemas';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

function extractPublicId(url: string): string | null {
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.\w+$/);
  return match ? match[1] : null;
}

export async function getMyRaffles(userId: string) {
  const raffles = await db
    .selectFrom('raffles')
    .selectAll()
    .where('user_id', '=', userId)
    .orderBy('created_at', 'desc')
    .execute();

  // Attach sold/reserved counts
  const rafflesWithStats = await Promise.all(
    raffles.map(async (raffle) => {
      const counts = await db
        .selectFrom('raffle_numbers')
        .select((eb) => [
          eb.fn.countAll<number>().as('total'),
          eb.fn
            .count<number>('id')
            .filterWhere('status', '=', 'sold')
            .as('sold'),
          eb.fn
            .count<number>('id')
            .filterWhere('status', '=', 'reserved')
            .as('reserved'),
        ])
        .where('raffle_id', '=', raffle.id)
        .executeTakeFirst();

      return { ...raffle, stats: counts };
    })
  );

  return rafflesWithStats;
}

export async function getRaffleById(raffleId: string, userId?: string) {
  const raffle = await db
    .selectFrom('raffles')
    .selectAll()
    .where('id', '=', raffleId)
    .executeTakeFirst();

  if (!raffle) throw new AppError('Rifa no encontrada', 404);

  // If not the owner, enforce visibility rules
  if (raffle.user_id !== userId) {
    if (raffle.status === 'draft') throw new AppError('Rifa no encontrada', 404);
  }

  return raffle;
}

export async function getRaffleBySlug(username: string, slug: string, accessCode?: string) {
  const user = await db
    .selectFrom('users')
    .select(['id', 'username', 'display_name', 'whatsapp_number', 'transfer_alias', 'transfer_holder', 'transfer_cuit', 'transfer_bank'])
    .where('username', '=', username)
    .executeTakeFirst();

  if (!user) throw new AppError('Usuario no encontrado', 404);

  const raffle = await db
    .selectFrom('raffles')
    .selectAll()
    .where('user_id', '=', user.id)
    .where('slug', '=', slug)
    .executeTakeFirst();

  if (!raffle || raffle.status === 'draft') throw new AppError('Rifa no encontrada', 404);

  if (raffle.visibility === 'private') {
    if (!accessCode || accessCode !== raffle.access_code) {
      throw new AppError('Código de acceso requerido', 403);
    }
  }

  const prizes = await db
    .selectFrom('prizes')
    .selectAll()
    .where('raffle_id', '=', raffle.id)
    .orderBy('position', 'asc')
    .execute();

  const promotions = await db
    .selectFrom('promotions')
    .selectAll()
    .where('raffle_id', '=', raffle.id)
    .where('active', '=', true)
    .execute();

  return { raffle, owner: user, prizes, promotions };
}

export async function createRaffle(userId: string, input: CreateRaffleInput) {
  const slug = generateSlug();

  const raffle = await db
    .insertInto('raffles')
    .values({
      user_id: userId,
      slug,
      title: input.title,
      description: input.description ?? null,
      total_numbers: input.total_numbers,
      price_per_number: input.price_per_number,
      status: input.status,
      visibility: input.visibility,
      access_code: input.access_code ?? null,
      cover_icon: input.cover_icon,
      draw_mode: input.draw_mode,
      draw_date: input.draw_date ? new Date(input.draw_date) : null,
      prize_assignment_mode: input.prize_assignment_mode,
      rich_content: input.rich_content ? JSON.stringify(input.rich_content) : null,
      confirmation_method: input.confirmation_method,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  // Generate all raffle numbers
  const numbers = Array.from({ length: input.total_numbers }, (_, i) => ({
    raffle_id: raffle.id,
    number: i,
    status: 'available' as const,
  }));

  // Insert in chunks of 500 to avoid query size limits
  const chunkSize = 500;
  for (let i = 0; i < numbers.length; i += chunkSize) {
    await db.insertInto('raffle_numbers').values(numbers.slice(i, i + chunkSize)).execute();
  }

  return raffle;
}

export async function updateRaffle(raffleId: string, userId: string, input: UpdateRaffleInput) {
  const raffle = await db
    .selectFrom('raffles')
    .select(['id', 'user_id', 'status'])
    .where('id', '=', raffleId)
    .executeTakeFirst();

  if (!raffle) throw new AppError('Rifa no encontrada', 404);
  if (raffle.user_id !== userId) throw new AppError('Sin permiso', 403);
  if (raffle.status === 'finished') throw new AppError('No se puede editar una rifa finalizada', 400);

  const updated = await db
    .updateTable('raffles')
    .set({
      ...input,
      draw_date: input.draw_date ? new Date(input.draw_date) : undefined,
      rich_content: input.rich_content ? JSON.stringify(input.rich_content) : undefined,
      updated_at: new Date(),
    })
    .where('id', '=', raffleId)
    .returningAll()
    .executeTakeFirstOrThrow();

  return updated;
}

export async function deleteRaffle(raffleId: string, userId: string) {
  const raffle = await db
    .selectFrom('raffles')
    .select(['id', 'user_id'])
    .where('id', '=', raffleId)
    .executeTakeFirst();

  if (!raffle) throw new AppError('Rifa no encontrada', 404);
  if (raffle.user_id !== userId) throw new AppError('Sin permiso', 403);

  // Collect prize images before deleting (cascade will remove DB rows)
  const prizeImages = await db
    .selectFrom('prizes')
    .select(['image_url'])
    .where('raffle_id', '=', raffleId)
    .execute();

  await db.deleteFrom('raffles').where('id', '=', raffleId).execute();

  // Delete Cloudinary images after DB delete (non-critical)
  for (const { image_url } of prizeImages) {
    if (image_url) {
      const publicId = extractPublicId(image_url);
      if (publicId) {
        cloudinary.uploader.destroy(publicId).catch(() => {/* non-critical */});
      }
    }
  }
}

export async function finishRaffle(raffleId: string, userId: string, input: FinishRaffleInput) {
  const raffle = await db
    .selectFrom('raffles')
    .select(['id', 'user_id', 'total_numbers'])
    .where('id', '=', raffleId)
    .executeTakeFirst();

  if (!raffle) throw new AppError('Rifa no encontrada', 404);
  if (raffle.user_id !== userId) throw new AppError('Sin permiso', 403);

  if (input.winner_number < 0 || input.winner_number >= raffle.total_numbers) {
    throw new AppError('Número ganador fuera de rango', 400);
  }

  const updated = await db
    .updateTable('raffles')
    .set({ status: 'finished', winner_number: input.winner_number, updated_at: new Date() })
    .where('id', '=', raffleId)
    .returningAll()
    .executeTakeFirstOrThrow();

  return updated;
}
