import { env } from './config/env';
import { pool, closePool } from './db/pool';
import { createFetchText } from './crawl/http';
import { crawlClient } from './crawl/crawl-client';
import { PgCrawlRepository } from './repositories/crawl-repository';
import { PgCrawlJobRepository } from './repositories/crawl-job-repository';
import { installProcessSafetyNets } from './process-safety';

installProcessSafetyNets('worker');

// Crawl queue worker — a second entrypoint of the `api` workspace. Drains
// crawl_jobs via SELECT ... FOR UPDATE SKIP LOCKED (so N replicas are safe) and
// runs crawlClient for each. A reaper requeues jobs stuck past the visibility
// timeout (crash recovery).

const LOOP_DELAY_MS = 1000; // pause between drain-loop iterations (busy or idle)
// Must exceed the worst-case crawl wall-time, or a still-running job gets reaped
// and double-crawled: up to 25 sitemap fetches + 15 page fetches at 10s each
// ≈ 6.7min. 10min leaves margin. (Parallelizing fetches — see scaling.md — would
// let this drop; recovery latency for a genuinely dead worker is the trade-off.)
const VISIBILITY_TIMEOUT_MS = 10 * 60_000;
const REAP_EVERY_MS = 60_000;

const workerId = `worker-${process.pid}`;
const repo = new PgCrawlRepository(pool);
const jobs = new PgCrawlJobRepository(pool);
const fetchText = createFetchText();

let running = true;
let lastReapAt = 0;

async function processOne(): Promise<boolean> {
  const job = await jobs.claimNext(workerId);
  if (!job) return false;
  try {
    await crawlClient(job.clientId, job.websiteUrl, { fetchText, repo });
    await jobs.complete(job.id);
  } catch (err) {
    await jobs.fail(job.id, err instanceof Error ? err.message : String(err));
  }
  return true;
}

async function maybeReap(now: number): Promise<void> {
  if (now - lastReapAt < REAP_EVERY_MS) return;
  lastReapAt = now;
  try {
    const requeued = await jobs.reapStuck(VISIBILITY_TIMEOUT_MS);
    if (requeued > 0) console.log(`[worker] reaped ${requeued} stuck job(s)`);
  } catch (err) {
    console.error('[worker] reaper error:', err);
  }
}

async function main(): Promise<void> {
  console.log(`[worker] ${workerId} started (timezone ${env.APP_TIMEZONE})`);
  while (running) {
    await maybeReap(Date.now());
    try {
      await processOne();
    } catch (err) {
      console.error('[worker] loop error:', err);
    }
    await sleep(LOOP_DELAY_MS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function shutdown(): Promise<void> {
  running = false;
  await closePool();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
