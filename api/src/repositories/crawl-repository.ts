import type { Pool, PoolClient } from 'pg';
import type { PageContent } from '../crawl/fetchPage';
import type { KeywordScore } from '../crawl/keywords';
import type { SeoIssue } from '../crawl/issues';

// Persistence for a crawl. The crawl orchestrator (crawl-client.ts) depends on
// this interface, so it can be unit-tested with a fake; PgCrawlRepository is the
// real SQL implementation (parameterized, with a per-page transaction).

export interface CrawlRepository {
  markCrawling(clientId: number): Promise<void>;
  setPagesTotal(clientId: number, total: number): Promise<void>;
  /** Upsert one page with its keywords and issues, and bump pages_done. */
  savePage(
    clientId: number,
    page: PageContent,
    keywords: KeywordScore[],
    issues: SeoIssue[],
  ): Promise<void>;
  markReady(clientId: number): Promise<void>;
  markFailed(clientId: number, error: string): Promise<void>;
}

export class PgCrawlRepository implements CrawlRepository {
  constructor(private readonly pool: Pool) {}

  async markCrawling(clientId: number): Promise<void> {
    await this.pool.query(
      `UPDATE clients SET crawl_status = 'CRAWLING', crawl_error = NULL, pages_done = 0 WHERE id = $1`,
      [clientId],
    );
  }

  async setPagesTotal(clientId: number, total: number): Promise<void> {
    await this.pool.query(`UPDATE clients SET pages_total = $2 WHERE id = $1`, [clientId, total]);
  }

  async markReady(clientId: number): Promise<void> {
    await this.pool.query(`UPDATE clients SET crawl_status = 'READY' WHERE id = $1`, [clientId]);
  }

  async markFailed(clientId: number, error: string): Promise<void> {
    await this.pool.query(
      `UPDATE clients SET crawl_status = 'FAILED', crawl_error = $2 WHERE id = $1`,
      [clientId, error.slice(0, 500)],
    );
  }

  async savePage(
    clientId: number,
    page: PageContent,
    keywords: KeywordScore[],
    issues: SeoIssue[],
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const pageId = await upsertPage(client, clientId, page);
      await replaceKeywords(client, pageId, keywords);
      await replaceIssues(client, pageId, issues);
      await client.query(`UPDATE clients SET pages_done = pages_done + 1 WHERE id = $1`, [clientId]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

async function upsertPage(
  client: PoolClient,
  clientId: number,
  page: PageContent,
): Promise<number> {
  const res = await client.query<{ id: number }>(
    `INSERT INTO pages (client_id, url, title, word_count, fetched_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (client_id, url)
     DO UPDATE SET title = EXCLUDED.title, word_count = EXCLUDED.word_count, fetched_at = now()
     RETURNING id`,
    [clientId, page.url, page.title || null, page.wordCount],
  );
  return res.rows[0]!.id;
}

async function replaceKeywords(
  client: PoolClient,
  pageId: number,
  keywords: KeywordScore[],
): Promise<void> {
  // Re-crawl semantics: drop this page's old links, then (re)insert.
  await client.query(`DELETE FROM page_keywords WHERE page_id = $1`, [pageId]);
  for (const kw of keywords) {
    const kwRes = await client.query<{ id: number }>(
      `INSERT INTO keywords (text) VALUES ($1)
       ON CONFLICT (text) DO UPDATE SET text = EXCLUDED.text
       RETURNING id`,
      [kw.text],
    );
    const keywordId = kwRes.rows[0]!.id;
    await client.query(
      `INSERT INTO page_keywords (page_id, keyword_id, relevance) VALUES ($1, $2, $3)
       ON CONFLICT (page_id, keyword_id) DO UPDATE SET relevance = EXCLUDED.relevance`,
      [pageId, keywordId, kw.relevance],
    );
  }
}

async function replaceIssues(
  client: PoolClient,
  pageId: number,
  issues: SeoIssue[],
): Promise<void> {
  await client.query(`DELETE FROM seo_issues WHERE page_id = $1`, [pageId]);
  for (const issue of issues) {
    await client.query(
      `INSERT INTO seo_issues (page_id, code, severity, message) VALUES ($1, $2, $3, $4)`,
      [pageId, issue.code, issue.severity, issue.message],
    );
  }
}
