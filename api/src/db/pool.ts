import { Pool, types } from 'pg';
import { env } from '../config/env';

// Parse bigint (int8, OID 20) as a JS number. Our ids comfortably fit in a safe
// integer at this scale; avoids the string-vs-number friction of pg's default.
types.setTypeParser(20, (v) => (v === null ? null : Number.parseInt(v, 10)));

// Single shared connection pool for the process (API or worker).
export const pool = new Pool({ connectionString: env.DATABASE_URL });

export async function closePool(): Promise<void> {
  await pool.end();
}
