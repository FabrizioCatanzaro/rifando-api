import { db } from '../../db/client';
import { AppError } from '../../middleware/errorHandler';
import type { UpdateProfileInput, ChangeUsernameInput } from './users.schemas';

export const USERNAME_CHANGE_COOLDOWN_DAYS = 30;

/**
 * Busca un usuario por su nombre actual o por un nombre que usó antes.
 * Así los links viejos (/nombre-viejo/rifa) siguen funcionando después de un cambio.
 */
export async function findUserIdByUsername(username: string): Promise<string | null> {
  const current = await db
    .selectFrom('users')
    .select('id')
    .where('username', '=', username)
    .executeTakeFirst();
  if (current) return current.id;

  const old = await db
    .selectFrom('username_history')
    .select('user_id')
    .where('username', '=', username)
    .executeTakeFirst();
  return old?.user_id ?? null;
}

/** Cambia el nombre de usuario. Máximo un cambio cada 30 días. */
export async function changeUsername(userId: string, input: ChangeUsernameInput) {
  const user = await db
    .selectFrom('users')
    .select(['username', 'username_changed_at'])
    .where('id', '=', userId)
    .executeTakeFirst();
  if (!user) throw new AppError('Usuario no encontrado', 404);

  const next = input.username;
  if (next === user.username) throw new AppError('Ese ya es tu nombre de usuario', 400);

  if (user.username_changed_at) {
    const allowedAt = new Date(user.username_changed_at);
    allowedAt.setDate(allowedAt.getDate() + USERNAME_CHANGE_COOLDOWN_DAYS);
    if (allowedAt > new Date()) {
      const fecha = allowedAt.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
      throw new AppError(`Podés volver a cambiar tu nombre de usuario a partir del ${fecha}`, 429);
    }
  }

  const takenNow = await db.selectFrom('users').select('id').where('username', '=', next).executeTakeFirst();
  const takenBefore = await db
    .selectFrom('username_history')
    .select('user_id')
    .where('username', '=', next)
    .executeTakeFirst();
  if (takenNow || (takenBefore && takenBefore.user_id !== userId)) {
    throw new AppError('Ese nombre de usuario no está disponible', 409);
  }

  const changedAt = new Date();
  return db.transaction().execute(async (trx) => {
    // Si vuelve a un nombre propio anterior, deja de ser historial.
    await trx.deleteFrom('username_history').where('user_id', '=', userId).where('username', '=', next).execute();
    await trx
      .insertInto('username_history')
      .values({ user_id: userId, username: user.username })
      .onConflict((oc) => oc.column('username').doNothing())
      .execute();
    return trx
      .updateTable('users')
      .set({ username: next, username_changed_at: changedAt, updated_at: changedAt })
      .where('id', '=', userId)
      .returning(['username', 'username_changed_at'])
      .executeTakeFirstOrThrow();
  });
}

export async function getPublicProfile(username: string) {
  const userId = await findUserIdByUsername(username);
  if (!userId) throw new AppError('Usuario no encontrado', 404);

  const user = await db
    .selectFrom('users')
    .select([
      'id',
      'username',
      'display_name',
      'avatar_url',
      'profile_public',
      'created_at',
    ])
    .where('id', '=', userId)
    .executeTakeFirst();

  if (!user) throw new AppError('Usuario no encontrado', 404);
  return user;
}

export async function getPublicRaffles(username: string) {
  const userId = await findUserIdByUsername(username);
  const user = userId
    ? await db
        .selectFrom('users')
        .select(['id', 'username', 'profile_public'])
        .where('id', '=', userId)
        .executeTakeFirst()
    : undefined;

  if (!user) throw new AppError('Usuario no encontrado', 404);

  // `username` es el nombre actual: el frontend redirige si la URL usa uno viejo.
  if (!user.profile_public) return { username: user.username, private: true, raffles: [] };

  const raffles = await db
    .selectFrom('raffles')
    .select([
      'id',
      'slug',
      'title',
      'description',
      'total_numbers',
      'price_per_number',
      'status',
      'cover_icon',
      'draw_mode',
      'draw_date',
      'created_at',
    ])
    .where('user_id', '=', user.id)
    .where('status', '=', 'active')
    .where('visibility', '=', 'public')
    .orderBy('created_at', 'desc')
    .execute();

  if (raffles.length === 0) return { username: user.username, private: false, raffles: [] };

  const raffleIds = raffles.map((r) => r.id);

  const soldCounts = await db
    .selectFrom('raffle_numbers')
    .select(['raffle_id', db.fn.count('id').as('sold')])
    .where('raffle_id', 'in', raffleIds)
    .where('status', '=', 'sold')
    .groupBy('raffle_id')
    .execute();

  const soldMap = new Map(soldCounts.map((r) => [r.raffle_id, Number(r.sold)]));

  return {
    username: user.username,
    private: false,
    raffles: raffles.map((r) => ({
      ...r,
      stats: { sold: soldMap.get(r.id) ?? 0, reserved: 0, total: r.total_numbers },
    })),
  };
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const updated = await db
    .updateTable('users')
    .set({
      ...input,
      updated_at: new Date(),
    })
    .where('id', '=', userId)
    .returning([
      'id',
      'email',
      'username',
      'display_name',
      'avatar_url',
      'whatsapp_number',
      'transfer_alias',
      'transfer_holder',
      'transfer_cuit',
      'transfer_bank',
      'profile_public',
    ])
    .executeTakeFirstOrThrow();

  return updated;
}
