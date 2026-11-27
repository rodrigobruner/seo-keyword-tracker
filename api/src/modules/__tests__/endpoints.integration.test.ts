import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createApp } from '../../app';
import { hashPassword } from '../../auth/password';

// Real-Postgres integration for the resource endpoints — the graded tenancy
// guarantee (User A can't reach User B's data) plus list/detail/snapshots/clients.
const RUN = process.env.RUN_DB_TESTS === '1';
const PW = 'endpoints-pass-123';

interface ListItem {
  id: number;
  url: string;
  clientName: string;
  keywords: string[];
  bestPosition: number | null;
  issueCount: number;
}
interface Series {
  keyword: string;
  points: unknown[];
}

describe.skipIf(!RUN)('API endpoints integration', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const app = createApp(pool);
  const id = { clientA: 0, clientB: 0, pageA: 0, pageA2: 0, pageB: 0 };
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;

  const insert = async (sql: string, params: unknown[]): Promise<number> =>
    (await pool.query<{ id: number }>(sql, params)).rows[0]!.id;

  beforeAll(async () => {
    await pool.query('TRUNCATE users, keywords RESTART IDENTITY CASCADE');
    const hash = await hashPassword(PW);
    const userA = await insert('INSERT INTO users (email,password_hash) VALUES ($1,$2) RETURNING id', ['alpha@example.com', hash]);
    const userB = await insert('INSERT INTO users (email,password_hash) VALUES ($1,$2) RETURNING id', ['beta@example.com', hash]);

    id.clientA = await insert('INSERT INTO clients (user_id,name,website_url,host) VALUES ($1,$2,$3,$4) RETURNING id', [userA, 'Alpha Co', 'https://alpha.test', 'alpha.test']);
    id.clientB = await insert('INSERT INTO clients (user_id,name,website_url,host) VALUES ($1,$2,$3,$4) RETURNING id', [userB, 'Beta Co', 'https://beta.test', 'beta.test']);

    id.pageA = await insert('INSERT INTO pages (client_id,url,title,word_count) VALUES ($1,$2,$3,$4) RETURNING id', [id.clientA, 'https://alpha.test/seo-guide', 'SEO Guide', 500]);
    id.pageA2 = await insert('INSERT INTO pages (client_id,url,title,word_count) VALUES ($1,$2,$3,$4) RETURNING id', [id.clientA, 'https://alpha.test/link-building', 'Link Building', 400]);
    id.pageB = await insert('INSERT INTO pages (client_id,url,title,word_count) VALUES ($1,$2,$3,$4) RETURNING id', [id.clientB, 'https://beta.test/post', 'Beta Post', 300]);

    const kw1 = await insert("INSERT INTO keywords (text) VALUES ('seo guide') RETURNING id", []);
    const kw2 = await insert("INSERT INTO keywords (text) VALUES ('keyword tool') RETURNING id", []);
    await pool.query('INSERT INTO page_keywords (page_id,keyword_id,relevance) VALUES ($1,$2,1.0),($1,$3,0.5)', [id.pageA, kw1, kw2]);
    await pool.query("INSERT INTO seo_issues (page_id,code,severity,message) VALUES ($1,'TITLE_TOO_SHORT','MEDIUM','short')", [id.pageA]);

    const now = new Date();
    for (const [kwId, pos] of [[kw1, 3], [kw2, 12]] as const) {
      for (let d = 0; d < 3; d++) {
        const at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - d));
        await pool.query('INSERT INTO rank_snapshots (page_id,keyword_id,captured_at,position) VALUES ($1,$2,$3,$4)', [id.pageA, kwId, at, pos]);
      }
    }

    agentA = request.agent(app);
    agentB = request.agent(app);
    await agentA.post('/auth/login').send({ email: 'alpha@example.com', password: PW }).expect(200);
    await agentB.post('/auth/login').send({ email: 'beta@example.com', password: PW }).expect(200);
  });

  afterAll(async () => {
    await pool.query('TRUNCATE users, keywords RESTART IDENTITY CASCADE');
    await pool.end();
  });

  it('tenancy: a user gets 404 for another user’s page/snapshots/client', async () => {
    await agentA.get(`/pages/${id.pageB}`).expect(404);
    await agentA.get(`/pages/${id.pageB}/snapshots`).expect(404);
    await agentA.get(`/clients/${id.clientB}`).expect(404);
    await agentB.get(`/pages/${id.pageA}`).expect(404);
  });

  it('pages list is scoped, searchable and paginated', async () => {
    const all = await agentA.get('/pages').expect(200);
    expect(all.body.total).toBe(2);
    expect(all.body.items.every((p: ListItem) => p.clientName === 'Alpha Co')).toBe(true);

    const search = await agentA.get('/pages?q=link').expect(200);
    expect(search.body.items.map((p: ListItem) => p.url)).toEqual(['https://alpha.test/link-building']);

    const otherClient = await agentA.get(`/pages?clientId=${id.clientB}`).expect(200);
    expect(otherClient.body.total).toBe(0);

    const paged = await agentA.get('/pages?pageSize=1&page=1').expect(200);
    expect(paged.body.items).toHaveLength(1);
    expect(paged.body.total).toBe(2);
  });

  it('page detail + list carry keywords, issues and best position', async () => {
    const detail = await agentA.get(`/pages/${id.pageA}`).expect(200);
    expect(detail.body.title).toBe('SEO Guide');
    expect(detail.body.keywords.map((k: { text: string }) => k.text)).toContain('seo guide');
    expect(detail.body.issues.map((i: { code: string }) => i.code)).toContain('TITLE_TOO_SHORT');

    const list = await agentA.get(`/pages?clientId=${id.clientA}`).expect(200);
    const pageA = list.body.items.find((p: ListItem) => p.id === id.pageA);
    expect(pageA.bestPosition).toBe(3); // min(latest 3, latest 12)
    expect(pageA.issueCount).toBe(1);
    expect(Array.isArray(pageA.keywords)).toBe(true); // citext[] must parse to a JS array
    expect(pageA.keywords).toContain('seo guide');
  });

  it('snapshots returns one series per keyword within range', async () => {
    const snaps = await agentA.get(`/pages/${id.pageA}/snapshots`).expect(200);
    expect(snaps.body.series).toHaveLength(2);
    const series = snaps.body.series.find((s: Series) => s.keyword === 'seo guide');
    expect(series.points).toHaveLength(3);
  });

  it('clients: list, create (enqueues a crawl), duplicate → 409, no auth → 401', async () => {
    expect((await agentA.get('/clients').expect(200)).body.items).toHaveLength(1);

    const created = await agentA
      .post('/clients')
      .send({ name: 'New Co', websiteUrl: 'https://new.test' })
      .expect(201);
    expect(created.body.host).toBe('new.test');
    expect(created.body.crawlStatus).toBe('PENDING');
    const jobs = await pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM crawl_jobs WHERE client_id = $1',
      [created.body.id],
    );
    expect(jobs.rows[0]!.n).toBe(1);

    await agentA.post('/clients').send({ name: 'Dup', websiteUrl: 'https://new.test' }).expect(409);
    await request(app).get('/clients').expect(401);
  });

  // Keep last: deleting clientA cascades its pages/snapshots.
  it('clients: delete is tenancy-scoped (404 for others) and cascades', async () => {
    await request(app).delete(`/clients/${id.clientA}`).expect(401); // no auth
    await agentA.delete(`/clients/${id.clientB}`).expect(404); // not A's → 404 (no leak)
    expect((await agentB.get(`/clients/${id.clientB}`).expect(200)).body.id).toBe(id.clientB); // untouched

    await agentA.delete(`/clients/${id.clientA}`).expect(204); // own client → deleted
    await agentA.get(`/clients/${id.clientA}`).expect(404);
    await agentA.get(`/pages/${id.pageA}`).expect(404); // cascaded away
    const snaps = await pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM rank_snapshots WHERE page_id = $1',
      [id.pageA],
    );
    expect(snaps.rows[0]!.n).toBe(0); // cascade reached rank_snapshots
  });
});
