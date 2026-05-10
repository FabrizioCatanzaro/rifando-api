import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  const client = await pool.connect();

  try {
    // Ensure migrations table exists first
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        run_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const { rows: ran } = await client.query<{ name: string }>(
      'SELECT name FROM migrations ORDER BY name'
    );
    const ranNames = new Set(ran.map((r) => r.name));

    for (const file of files) {
      if (ranNames.has(file)) {
        console.log(`  skip  ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO migrations(name) VALUES($1)', [file]);
        await client.query('COMMIT');
        console.log(`  ran   ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    console.log('Migrations complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
