import express, { type Express } from 'express';

// Express app factory (kept separate from the HTTP listener so integration
// tests can mount it with supertest without binding a port).
export function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Feature routers (auth, clients, pages) are mounted in later phases.

  return app;
}
