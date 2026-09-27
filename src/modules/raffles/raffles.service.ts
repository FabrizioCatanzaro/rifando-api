import crypto from 'crypto';
import type { Kysely } from 'kysely';
import { v2 as cloudinary } from 'cloudinary';
import { db } from '../../db/client';
import { AppError } from '../../middleware/errorHandler';
import { generateReadableSlug, generateSlug } from '../../utils/slug';
import { findUserIdByUsername } from '../users/users.service';
import { env } from '../../config/env';
import type { Database } from '../../types/db';
import type { CreateRaffleInput, UpdateRaffleInput, FinishRaffleInput } from './raffles.schemas';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

const ACCESS_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Código de 6 caracteres sin letras ambiguas (O/0, I/1). */
function generateAccessCode(): string {
  return Array.from({ length: 6 }, () => ACCESS_CODE_ALPHABET[crypto.randomInt(ACCESS_CODE_ALPHABET.length)]).join('');
}

/** Inserta los números 0..total-1 en lotes de 500. */
async function insertRaffleNumbers(executor: Kysely<Database>, raffleId: string, total: number) {
  const numbers = Array.from({ length: total }, (_, i) => ({
    raffle_id: raffleId,
    number: i,
    status: 'available' as const,
  }));
  const chunkSize = 500;
  for (let i = 0; i < numbers.length; i += chunkSize) {
    await executor.insertInto('raffle_numbers').values(numbers.slice(i, i + chunkSize)).execute();
  }
}

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
          eb.fn
            .coalesce(eb.fn.sum<number>('sale_amount').filterWhere('status', '=', 'sold'), eb.lit(0))
            .as('revenue'),
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
  // Acepta nombres de usuario anteriores: los links viejos siguen funcionando.
  // `owner.username` devuelve el nombre actual para que el frontend redirija.
  const ownerId = await findUserIdByUsername(username);
  const user = ownerId
    ? await db
        .selectFrom('users')
        .select(['id', 'username', 'display_name', 'whatsapp_number', 'transfer_alias', 'transfer_holder', 'transfer_cuit', 'transfer_bank'])
        .where('id', '=', ownerId)
        .executeTakeFirst()
    : undefined;

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

  // When finished, enrich prizes with buyer names for winners/substitutes
  let enrichedPrizes = prizes.map((p) => ({ ...p, winner_buyer_name: null as string | null, substitutes: [] as { number: number; buyer_name: string | null }[] }));

  if (raffle.status === 'finished') {
    const allWinnerNumbers = prizes.flatMap((p) => {
      const subs = Array.isArray(p.substitute_numbers) ? (p.substitute_numbers as number[]) : [];
      return p.winner_number !== null ? [p.winner_number, ...subs] : subs;
    });

    if (allWinnerNumbers.length > 0) {
      const buyerRows = await db
        .selectFrom('raffle_numbers')
        .select(['number', 'buyer_name'])
        .where('raffle_id', '=', raffle.id)
        .where('number', 'in', allWinnerNumbers)
        .execute();

      const buyerMap = new Map(buyerRows.map((r) => [r.number, r.buyer_name]));

      enrichedPrizes = prizes.map((p) => {
        const subs = Array.isArray(p.substitute_numbers) ? (p.substitute_numbers as number[]) : [];
        return {
          ...p,
          winner_buyer_name: p.winner_number !== null ? (buyerMap.get(p.winner_number) ?? null) : null,
          substitutes: subs.map((n) => ({ number: n, buyer_name: buyerMap.get(n) ?? null })),
        };
      });
    }
  }

  return { raffle, owner: user, prizes: enrichedPrizes, promotions };
}

/** Slug único por usuario. Pública: legible desde el título. Privada: aleatorio. */
async function uniqueSlug(userId: string, title: string | null): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = title ? generateReadableSlug(title) : generateSlug();
    const taken = await db
      .selectFrom('raffles')
      .select('id')
      .where('user_id', '=', userId)
      .where('slug', '=', slug)
      .executeTakeFirst();
    if (!taken) return slug;
  }
  return generateSlug();
}

export async function createRaffle(userId: string, input: CreateRaffleInput) {
  const slug = await uniqueSlug(userId, input.visibility === 'public' ? input.title : null);

  const raffle = await db
    .insertInto('raffles')
    .values({
      user_id: userId,
      slug,
      title: input.title,
      description: input.description ?? null,
      total_numbers: input.total_numbers,
      price_per_number: input.price_per_number,
      status: 'draft',
      visibility: input.visibility,
      access_code:
        input.visibility === 'private' ? (input.access_code ?? generateAccessCode()) : (input.access_code ?? null),
      cover_icon: input.cover_icon,
      draw_mode: input.draw_mode,
      draw_date: input.draw_date ? new Date(input.draw_date) : null,
      prize_assignment_mode: input.prize_assignment_mode,
      rich_content: input.rich_content ? JSON.stringify(input.rich_content) : null,
      confirmation_method: input.confirmation_method,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  await insertRaffleNumbers(db, raffle.id, input.total_numbers);

  return raffle;
}

// Campos que definen la rifa. Solo se editan en borrador y sin números vendidos o reservados.
const LOCKED_FIELDS = [
  'title',
  'total_numbers',
  'price_per_number',
  'visibility',
  'access_code',
  'draw_mode',
  'draw_date',
  'prize_assignment_mode',
] as const;

export async function updateRaffle(raffleId: string, userId: string, input: UpdateRaffleInput) {
  const raffle = await db
    .selectFrom('raffles')
    .selectAll()
    .where('id', '=', raffleId)
    .executeTakeFirst();

  if (!raffle) throw new AppError('Rifa no encontrada', 404);
  if (raffle.user_id !== userId) throw new AppError('Sin permiso', 403);
  if (raffle.status === 'finished') throw new AppError('No se puede editar una rifa finalizada', 400);

  const touchesLocked = LOCKED_FIELDS.some((field) => {
    if (input[field] === undefined) return false;
    if (field === 'draw_date') {
      const current = raffle.draw_date ? new Date(raffle.draw_date).getTime() : null;
      return current !== new Date(input.draw_date as string).getTime();
    }
    return input[field] !== raffle[field];
  });

  if (touchesLocked) {
    if (raffle.status !== 'draft') {
      throw new AppError('La rifa está publicada. Solo podés cambiar el ícono, el método de confirmación y la información.', 409);
    }
    const [{ count }] = await db
      .selectFrom('raffle_numbers')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('raffle_id', '=', raffleId)
      .where('status', '!=', 'available')
      .execute();
    if (Number(count) > 0) {
      throw new AppError('La rifa ya tiene números vendidos o reservados. No podés cambiar su configuración.', 409);
    }
  }

  // Estado resultante, para validar reglas que combinan campos.
  const next = {
    visibility: input.visibility ?? raffle.visibility,
    access_code: input.access_code ?? raffle.access_code,
    draw_mode: input.draw_mode ?? raffle.draw_mode,
    draw_date: input.draw_date ?? raffle.draw_date,
    status: input.status ?? raffle.status,
  };

  // La fecha se exige al tocar la modalidad o la fecha, o al publicar desde borrador.
  const checksDrawDate =
    input.draw_mode !== undefined ||
    input.draw_date !== undefined ||
    (input.status === 'active' && raffle.status === 'draft');
  if (checksDrawDate && next.draw_mode !== 'all_sold' && !next.draw_date) {
    throw new AppError('Elegí la fecha límite del sorteo', 400);
  }
  if (next.status === 'active' && raffle.status === 'draft' && next.draw_date && next.draw_mode !== 'all_sold') {
    if (new Date(next.draw_date).getTime() <= Date.now()) {
      throw new AppError('La fecha límite del sorteo ya pasó', 400);
    }
  }
  if (input.status === 'active' && raffle.status === 'draft') {
    const [{ count }] = await db
      .selectFrom('prizes')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('raffle_id', '=', raffleId)
      .execute();
    if (Number(count) === 0) {
      throw new AppError('Cargá al menos un premio para publicar la rifa', 400);
    }
  }

  const accessCode = next.visibility === 'private' && !next.access_code ? generateAccessCode() : undefined;

  const updated = await db.transaction().execute(async (trx) => {
    const row = await trx
      .updateTable('raffles')
      .set({
        ...input,
        access_code: accessCode ?? input.access_code,
        draw_date: input.draw_date ? new Date(input.draw_date) : undefined,
        rich_content: input.rich_content ? JSON.stringify(input.rich_content) : undefined,
        updated_at: new Date(),
      })
      .where('id', '=', raffleId)
      .returningAll()
      .executeTakeFirstOrThrow();

    // En borrador sin ventas, cambiar la cantidad regenera la grilla.
    if (input.total_numbers !== undefined && input.total_numbers !== raffle.total_numbers) {
      await trx.deleteFrom('number_reservations').where('raffle_id', '=', raffleId).execute();
      await trx.deleteFrom('raffle_numbers').where('raffle_id', '=', raffleId).execute();
      await insertRaffleNumbers(trx, raffleId, input.total_numbers);
    }

    return row;
  });

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

  if (input.winner_number != null) {
    if (input.winner_number < 0 || input.winner_number >= raffle.total_numbers) {
      throw new AppError('Número ganador fuera de rango', 400);
    }
  }

  const updated = await db
    .updateTable('raffles')
    .set({ status: 'finished', winner_number: input.winner_number ?? null, updated_at: new Date() })
    .where('id', '=', raffleId)
    .returningAll()
    .executeTakeFirstOrThrow();

  return updated;
}
