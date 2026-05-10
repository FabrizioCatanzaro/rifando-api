import { db } from '../../db/client';
import { AppError } from '../../middleware/errorHandler';
import type { UpdateProfileInput } from './users.schemas';

export async function getPublicProfile(username: string) {
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
    .where('username', '=', username)
    .executeTakeFirst();

  if (!user) throw new AppError('Usuario no encontrado', 404);
  return user;
}

export async function getPublicRaffles(username: string) {
  const user = await db
    .selectFrom('users')
    .select(['id', 'profile_public'])
    .where('username', '=', username)
    .executeTakeFirst();

  if (!user) throw new AppError('Usuario no encontrado', 404);

  if (!user.profile_public) return { private: true, raffles: [] };

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

  return { private: false, raffles };
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
      'profile_public',
    ])
    .executeTakeFirstOrThrow();

  return updated;
}
