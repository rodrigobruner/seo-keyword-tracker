import { env } from './config/env';
import { closePool } from './db/pool';

// Crawl queue worker — a second entrypoint of the `api` workspace (shares the
// db pool, config, and crawl logic with the API). The full dequeue loop
// (SELECT ... FOR UPDATE SKIP LOCKED → crawlClient → reaper) lands in the crawl
// phase; this is the runnable skeleton.
const POLL_INTERVAL_MS = 1000;
let running = true;

async function tick(): Promise<void> {
  // TODO(crawl phase): claim a crawl_jobs row via SKIP LOCKED and process it.
}

async function main(): Promise<void> {
  console.log(`[worker] started (timezone ${env.APP_TIMEZONE})`);
  while (running) {
    await tick();
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
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
