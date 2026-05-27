import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

export interface Database {
  users: UsersTable;
  raffles: RafflesTable;
  raffle_numbers: RaffleNumbersTable;
  number_reservations: NumberReservationsTable;
  prizes: PrizesTable;
  promotions: PromotionsTable;
  refresh_tokens: RefreshTokensTable;
  migrations: MigrationsTable;
  raffle_draw_payments: RaffleDrawPaymentsTable;
}

export interface UsersTable {
  id: Generated<string>;
  email: string;
  username: string;
  password_hash: string;
  display_name: string | null;
  avatar_url: string | null;
  whatsapp_number: string | null;
  transfer_alias: string | null;
  transfer_holder: string | null;
  transfer_cuit: string | null;
  transfer_bank: string | null;
  profile_public: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface RafflesTable {
  id: Generated<string>;
  user_id: string;
  slug: string;
  title: string;
  description: string | null;
  total_numbers: number;
  price_per_number: number;
  status: 'draft' | 'active' | 'finished';
  visibility: 'public' | 'private';
  access_code: string | null;
  cover_icon: Generated<string>;
  draw_mode: 'all_sold' | 'fixed_date' | 'first_event';
  draw_date: Date | null;
  prize_assignment_mode: 'automatic' | 'sequential_choice';
  winner_number: number | null;
  rich_content: string | null;
  confirmation_method: Generated<'whatsapp' | 'upload'>;
  draw_unlocked: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface RaffleNumbersTable {
  id: Generated<string>;
  raffle_id: string;
  number: number;
  status: 'available' | 'reserved' | 'sold';
  buyer_name: string | null;
  buyer_phone: string | null;
  sold_at: Date | null;
}

export interface NumberReservationsTable {
  id: Generated<string>;
  raffle_id: string;
  number: number;
  session_id: string;
  buyer_name: string | null;
  comprobante_url: string | null;
  expires_at: Date;
  created_at: Generated<Date>;
}

export interface PrizesTable {
  id: Generated<string>;
  raffle_id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  position: number;
  winner_number: number | null;
  substitute_numbers: Generated<number[]>;
  created_at: Generated<Date>;
}

export interface PromotionsTable {
  id: Generated<string>;
  raffle_id: string;
  type: 'pack' | 'percentage' | 'bundle';
  label: string;
  quantity: number;
  price: number | null;
  discount_percentage: number | null;
  free_numbers: number | null;
  active: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface RefreshTokensTable {
  id: Generated<string>;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface RaffleDrawPaymentsTable {
  id: Generated<string>;
  raffle_id: string;
  comprobante_url: string;
  status: Generated<'pending' | 'approved' | 'rejected'>;
  created_at: Generated<Date>;
  reviewed_at: Date | null;
}

export interface MigrationsTable {
  id: Generated<number>;
  name: string;
  run_at: Generated<Date>;
}

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;

export type Raffle = Selectable<RafflesTable>;
export type NewRaffle = Insertable<RafflesTable>;
export type RaffleUpdate = Updateable<RafflesTable>;

export type RaffleNumber = Selectable<RaffleNumbersTable>;
export type Prize = Selectable<PrizesTable>;
export type Promotion = Selectable<PromotionsTable>;
