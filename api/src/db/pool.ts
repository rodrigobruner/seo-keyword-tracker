import { Pool } from 'pg';
import { env } from '../config/env';

// Single shared connection pool for the process (API or worker).
export const pool = new Pool({ connectionString: env.DATABASE_URL });

export async function closePool(): Promise<void> {
  await pool.end();
}
