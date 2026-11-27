import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import type { Pool } from 'pg';
import { pool as sharedPool } from './db/pool';
import { env } from './config/env';
import { authRouter } from './modules/auth/auth.routes';
import { clientsRouter } from './modules/clients/clients.routes';
import { pagesRouter } from './modules/pages/pages.routes';
import { errorHandler, notFound } from './middleware/error';

// Express app factory (kept separate from the HTTP listener so integration tests
// can mount it with supertest and inject a test pool, without binding a port).
export function createApp(pool: Pool = sharedPool): Express {
  const app = express();
  app.use(helmet());
  // Dev uses the Vite proxy (same-origin); prod allows the configured web origin.
  if (env.NODE_ENV === 'production') {
    app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  }
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/auth', authRouter(pool));
  app.use('/clients', clientsRouter(pool));
  app.use('/pages', pagesRouter(pool));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
