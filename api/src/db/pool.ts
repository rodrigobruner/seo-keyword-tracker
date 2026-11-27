import { Pool, types } from 'pg';
import { env } from '../config/env';

// Parse bigint (int8, OID 20) as a JS number. Our ids comfortably fit in a safe
// integer at this scale; avoids the string-vs-number friction of pg's default.
types.setTypeParser(20, (v) => (v === null ? null : Number.parseInt(v, 10)));

// Single shared connection pool for the process (API or worker).
// Liveness guards: no single query may hold a connection forever, and a request
// fails fast (rather than hanging) when the pool is exhausted. 30s is generous
// for the seed's 10k-row batch inserts, yet bounds a stuck/locked query.
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  statement_timeout: 30_000, // server aborts any statement running past 30s
  query_timeout: 30_000, // client rejects the query past 30s
  connectionTimeoutMillis: 5_000, // fail fast if no pooled connection within 5s
});

// A pooled client can error while idle (DB restart, network drop, idle-timeout
// kill). Without a listener, pg emits this 'error' as an uncaught exception and
// the process crashes. Log it and let the pool discard/replace the client.
pool.on('error', (err) => {
  console.error('[db] idle client error:', err.message);
});

export async function closePool(): Promise<void> {
  await pool.end();
}
