import { Router } from 'express';
import { z } from 'zod';
import type { Pool } from 'pg';
import { requireAuth } from '../../middleware/auth';
import { PageRepository } from '../../repositories/page-repository';

const ListQuery = z.object({
  clientId: z.coerce.number().int().positive().optional(),
  q: z.string().trim().min(1).max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['url', 'position', 'issues']).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
});

const SnapshotQuery = z.object({ from: z.string().optional(), to: z.string().optional() });
const DAY_MS = 86_400_000;

// The frontend converts Toronto dates to UTC and sends ISO; the API stays pure
// UTC. Defaults to the last 90 days.
function resolveRange(from?: string, to?: string): { fromUtc: Date; toUtc: Date } {
  const toUtc = to ? new Date(to) : new Date();
  const fromUtc = from ? new Date(from) : new Date(toUtc.getTime() - 90 * DAY_MS);
  return { fromUtc, toUtc };
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function pagesRouter(pool: Pool): Router {
  const pages = new PageRepository(pool);
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    const parsed = ListQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid query' });
      return;
    }
    const { clientId, q, page, pageSize, sort, dir } = parsed.data;
    const result = await pages.listForUser(req.userId!, {
      clientId: clientId ?? null,
      q: q ?? null,
      limit: pageSize,
      offset: (page - 1) * pageSize,
      sort,
      dir,
    });
    res.json({ items: result.items, total: result.total, page, pageSize });
  });

  router.get('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const detail = await pages.findByIdForUser(id, req.userId!);
    if (!detail) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json(detail);
  });

  router.get('/:id/snapshots', async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const parsed = SnapshotQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid query' });
      return;
    }
    const { fromUtc, toUtc } = resolveRange(parsed.data.from, parsed.data.to);
    const series = await pages.snapshotsForUser(id, req.userId!, fromUtc, toUtc);
    if (series === null) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json({ series });
  });

  return router;
}
