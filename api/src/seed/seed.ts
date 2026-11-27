import bcrypt from 'bcryptjs';
import { pool, closePool } from '../db/pool';
import { createFetchText } from '../crawl/http';
import { withFixtureFallback } from './fixtures';
import { crawlClient } from '../crawl/crawl-client';
import { PgCrawlRepository } from '../repositories/crawl-repository';

// Committed, idempotent seed. Rebuilds from scratch:
//   1. 2 users, each with 1 client (semrush, yoast)
//   2. the SAME crawl routine populates pages/keywords/issues (live sites)
//   3. daily rank snapshots for every (page, keyword) pair → >= 50k rows,
//      with a SEEDABLE RNG (reproducible random walk).
// Positions are invented (nothing talks to Google). Snapshots are stored in UTC.

const SNAPSHOT_TARGET = 50_000;
const MIN_HISTORY_DAYS = 90;
const RNG_SEED = 0x5eed_1234;
const BATCH_ROWS = 10_000;

// Demo accounts (documented in the README). Same password for both; the password
// comes from SEED_PASSWORD (see .env.example) so it isn't hardcoded in source.
const SEED_PASSWORD = process.env.SEED_PASSWORD;
const ACCOUNTS = [
  { email: 'demo@semrush.com', client: 'Semrush', url: 'https://www.semrush.com' },
  { email: 'demo@yoast.com', client: 'Yoast', url: 'https://yoast.com' },
];

/** Deterministic PRNG (mulberry32) → reproducible snapshots. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hostOf(url: string): string {
  return new URL(url).host;
}

async function seed(): Promise<void> {
  if (!SEED_PASSWORD) {
    throw new Error('SEED_PASSWORD is not set. Copy .env.example to .env (see README).');
  }
  const rng = mulberry32(RNG_SEED);
  const repo = new PgCrawlRepository(pool);
  const fetchText = withFixtureFallback(createFetchText());

  console.log('[seed] resetting data...');
  await pool.query('TRUNCATE users, keywords RESTART IDENTITY CASCADE');

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  for (const acc of ACCOUNTS) {
    const user = await pool.query<{ id: number }>(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      [acc.email, passwordHash],
    );
    const userId = user.rows[0]!.id;
    const client = await pool.query<{ id: number }>(
      'INSERT INTO clients (user_id, name, website_url, host) VALUES ($1, $2, $3, $4) RETURNING id',
      [userId, acc.client, acc.url, hostOf(acc.url)],
    );
    const clientId = client.rows[0]!.id;

    console.log(`[seed] crawling ${acc.client} (${acc.url})...`);
    const result = await crawlClient(clientId, acc.url, { fetchText, repo });
    console.log(`[seed]   ${acc.client}: ${result.status}, ${result.pagesCrawled} page(s)`);
  }

  await generateSnapshots(rng);

  const counts = await pool.query<{ table_name: string; n: string }>(`
    SELECT 'users' AS table_name, count(*)::text AS n FROM users
    UNION ALL SELECT 'clients', count(*)::text FROM clients
    UNION ALL SELECT 'pages', count(*)::text FROM pages
    UNION ALL SELECT 'keywords', count(*)::text FROM keywords
    UNION ALL SELECT 'seo_issues', count(*)::text FROM seo_issues
    UNION ALL SELECT 'rank_snapshots', count(*)::text FROM rank_snapshots
  `);
  console.log('[seed] done:');
  for (const r of counts.rows) console.log(`[seed]   ${r.table_name.padEnd(16)} ${r.n}`);
}

async function generateSnapshots(rng: () => number): Promise<void> {
  const pairs = (
    await pool.query<{ page_id: number; keyword_id: number }>(
      'SELECT page_id, keyword_id FROM page_keywords ORDER BY page_id, keyword_id',
    )
  ).rows;

  if (pairs.length === 0) {
    console.warn('[seed] no (page, keyword) pairs, skipping snapshots (crawl produced nothing).');
    return;
  }

  const days = Math.max(Math.ceil(SNAPSHOT_TARGET / pairs.length), MIN_HISTORY_DAYS);
  console.log(`[seed] generating ${pairs.length} pairs x ${days} days of snapshots...`);

  const now = new Date();
  const endUtcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const DAY_MS = 86_400_000;

  let pageBatch: number[] = [];
  let kwBatch: number[] = [];
  let atBatch: Date[] = [];
  let posBatch: number[] = [];

  const flush = async () => {
    if (pageBatch.length === 0) return;
    await pool.query(
      `INSERT INTO rank_snapshots (page_id, keyword_id, captured_at, position)
       SELECT * FROM unnest($1::bigint[], $2::bigint[], $3::timestamptz[], $4::smallint[])`,
      [pageBatch, kwBatch, atBatch, posBatch],
    );
    pageBatch = [];
    kwBatch = [];
    atBatch = [];
    posBatch = [];
  };

  for (const pair of pairs) {
    let position = 1 + Math.floor(rng() * 100); // start 1..100
    for (let d = 0; d < days; d++) {
      const delta = Math.round((rng() - 0.5) * 6); // -3..+3
      position = Math.min(100, Math.max(1, position + delta));
      pageBatch.push(pair.page_id);
      kwBatch.push(pair.keyword_id);
      atBatch.push(new Date(endUtcMs - (days - 1 - d) * DAY_MS));
      posBatch.push(position);
      if (pageBatch.length >= BATCH_ROWS) await flush();
    }
  }
  await flush();
}

seed()
  .then(() => closePool())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('[seed] failed:', err);
    await closePool().catch(() => undefined);
    process.exit(1);
  });
