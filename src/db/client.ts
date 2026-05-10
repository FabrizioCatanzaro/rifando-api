import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { env } from '../config/env';
import type { Database } from '../types/db';

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});
