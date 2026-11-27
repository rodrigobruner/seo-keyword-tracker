import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { Pool } from 'pg';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/async-handler';
import { ClientRepository } from '../../repositories/client-repository';
import { PgCrawlJobRepository } from '../../repositories/crawl-job-repository';
import { assertHttpUrl, SsrfError } from '../../crawl/http';
import { parseId } from '../../util/params';

const CreateBody = z.object({
  name: z.string().trim().min(1).max(200),
  websiteUrl: z.string().trim().min(1).max(2000),
});

// Each create enqueues a crawl (outbound fetches to a user-supplied URL), so a
// signed-in user must not be able to spam it into resource exhaustion or use the
// crawler to hammer a third-party site. Rate-limit per user (keyed by userId,
// since requireAuth runs first).
const createClientLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.userId),
  message: { error: 'Too many new clients. Please wait a few minutes and try again.' },
});

export function clientsRouter(pool: Pool): Router {
  const clients = new ClientRepository(pool);
  const jobs = new PgCrawlJobRepository(pool);
  const router = Router();
  router.use(requireAuth);

  router.get('/', asyncHandler(async (req, res) => {
    res.json({ items: await clients.listForUser(req.userId!) });
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const client = await clients.findByIdForUser(id, req.userId!);
    if (!client) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json(client);
  }));

  router.post('/', createClientLimiter, asyncHandler(async (req, res) => {
    const parsed = CreateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid input' });
      return;
    }
    const raw = parsed.data.websiteUrl;
    let url: URL;
    try {
      url = assertHttpUrl(raw.includes('://') ? raw : `https://${raw}`);
    } catch (err) {
      res.status(400).json({ error: err instanceof SsrfError ? err.message : 'invalid website URL' });
      return;
    }

    const result = await clients.create(req.userId!, parsed.data.name, url.toString(), url.host);
    if (result === 'duplicate') {
      res.status(409).json({ error: 'you already have a client for this website' });
      return;
    }
    await jobs.enqueue(result.id); // worker picks it up and crawls
    res.status(201).json(await clients.findByIdForUser(result.id, req.userId!));
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const deleted = await clients.deleteForUser(id, req.userId!);
    if (!deleted) {
      res.status(404).json({ error: 'not found' }); // absent or another user's
      return;
    }
    res.status(204).end();
  }));

  return router;
}
