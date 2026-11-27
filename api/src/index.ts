import { createApp } from './app';
import { env } from './config/env';
import { closePool } from './db/pool';
import { installProcessSafetyNets } from './process-safety';

installProcessSafetyNets('api');

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`[api] listening on http://localhost:${env.PORT}`);
});

// Graceful shutdown: on a stop signal, stop accepting new connections and let
// in-flight requests finish (bounded), then close the pool and exit — so a
// container stop doesn't drop live requests or leak DB connections.
const SHUTDOWN_TIMEOUT_MS = 10_000;
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[api] ${signal} received, draining…`);
  const drained = new Promise<void>((resolve) => server.close(() => resolve()));
  const deadline = new Promise<void>((resolve) => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS));
  await Promise.race([drained, deadline]);
  await closePool().catch(() => undefined);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
