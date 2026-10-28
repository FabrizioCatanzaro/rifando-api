import { Kysely, PostgresDialect } from 'kysely';
import { Pool, types } from 'pg';
import { env } from '../config/env';
import type { Database } from '../types/db';

// pg devuelve NUMERIC (1700) y BIGINT/COUNT (20) como string. Los convertimos a number.
types.setTypeParser(1700, (v) => parseFloat(v));
types.setTypeParser(20, (v) => parseInt(v, 10));

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});
