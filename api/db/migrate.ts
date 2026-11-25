import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';
import { env } from '../src/config/env';

// Minimal, idempotent, forward-only migration runner.
// Applies each unapplied db/migrations/*.sql in filename order, one transaction
// per file, tracking applied files in a `_migrations` table.
const MIGRATIONS_DIR = join(__dirname, 'migrations');

async function migrate(): Promise<void> {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS _migrations (
         name       text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    const applied = new Set(
      (await pool.query<{ name: string }>('SELECT name FROM _migrations')).rows.map((r) => r.name),
    );

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`[migrate] skip ${file}`);
        continue;
      }
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[migrate] applied ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }
    console.log('[migrate] done');
  } finally {
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('[migrate] failed:', err);
  process.exit(1);
});
