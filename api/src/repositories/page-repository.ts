import type { Pool } from 'pg';

export interface PageListItem {
  id: number;
  url: string;
  title: string | null;
  clientId: number;
  clientName: string;
  issueCount: number;
  keywords: string[];
  bestPosition: number | null;
}

export interface PageListResult {
  items: PageListItem[];
  total: number;
}

export interface PageDetail {
  id: number;
  url: string;
  title: string | null;
  wordCount: number | null;
  clientId: number;
  clientName: string;
  keywords: { text: string; relevance: number }[];
  issues: { code: string; severity: string; message: string }[];
}

export interface KeywordSeries {
  keyword: string;
  points: { capturedAt: string; position: number }[];
}

export interface ListOptions {
  clientId?: number | null;
  q?: string | null;
  limit: number;
  offset: number;
  sort?: string;
  dir?: string;
}

// Sort injection guard: user input maps to a fixed set of safe columns only.
const SORT_COLUMNS = {
  url: 'p.url',
  position: 'best_position',
  issues: 'issue_count',
} as const;
type SortKey = keyof typeof SORT_COLUMNS;

export function buildPageOrderBy(sort?: string, dir?: string): string {
  const key: SortKey = sort && sort in SORT_COLUMNS ? (sort as SortKey) : 'url';
  const direction = dir === 'desc' ? 'DESC' : 'ASC';
  return `${SORT_COLUMNS[key]} ${direction} NULLS LAST, p.id ASC`;
}

const MAX_KEYWORDS_IN_LIST = 5;

// Shared tenancy + filter predicate ($1 user, $2 clientId, $3 search).
const WHERE = `c.user_id = $1
  AND ($2::bigint IS NULL OR p.client_id = $2)
  AND ($3::text IS NULL OR p.url ILIKE $3 OR EXISTS (
    SELECT 1 FROM page_keywords pk JOIN keywords k ON k.id = pk.keyword_id
    WHERE pk.page_id = p.id AND k.text ILIKE $3))`;

interface ListRow {
  id: number;
  url: string;
  title: string | null;
  client_id: number;
  client_name: string;
  issue_count: number;
  keywords: string[];
  best_position: number | null;
}

export class PageRepository {
  constructor(private readonly pool: Pool) {}

  /** Pages for a user (tenancy-scoped), with filter, search, pagination and each
   *  page's best current rank position (lowest across its keywords, latest date). */
  async listForUser(userId: number, opts: ListOptions): Promise<PageListResult> {
    const clientId = opts.clientId ?? null;
    const search = opts.q ? `%${opts.q}%` : null;
    const orderBy = buildPageOrderBy(opts.sort, opts.dir);

    const items = await this.pool.query<ListRow>(
      `SELECT p.id, p.url, p.title, p.client_id, c.name AS client_name,
         (SELECT count(*)::int FROM seo_issues si WHERE si.page_id = p.id) AS issue_count,
         COALESCE((SELECT array_agg(k.text::text ORDER BY pk.relevance DESC)
                   FROM page_keywords pk JOIN keywords k ON k.id = pk.keyword_id
                   WHERE pk.page_id = p.id), '{}') AS keywords,
         lp.best_position
       FROM pages p
       JOIN clients c ON c.id = p.client_id
       LEFT JOIN LATERAL (
         SELECT min(position)::int AS best_position FROM (
           SELECT DISTINCT ON (keyword_id) position
           FROM rank_snapshots rs WHERE rs.page_id = p.id
           ORDER BY keyword_id, captured_at DESC
         ) latest
       ) lp ON TRUE
       WHERE ${WHERE}
       ORDER BY ${orderBy}
       LIMIT $4 OFFSET $5`,
      [userId, clientId, search, opts.limit, opts.offset],
    );

    const totalRes = await this.pool.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM pages p JOIN clients c ON c.id = p.client_id WHERE ${WHERE}`,
      [userId, clientId, search],
    );

    return {
      items: items.rows.map((r) => ({
        id: r.id,
        url: r.url,
        title: r.title,
        clientId: r.client_id,
        clientName: r.client_name,
        issueCount: r.issue_count,
        keywords: r.keywords.slice(0, MAX_KEYWORDS_IN_LIST),
        bestPosition: r.best_position,
      })),
      total: totalRes.rows[0]?.total ?? 0,
    };
  }

  async findByIdForUser(id: number, userId: number): Promise<PageDetail | null> {
    const pageRes = await this.pool.query<{
      id: number;
      url: string;
      title: string | null;
      word_count: number | null;
      client_id: number;
      client_name: string;
    }>(
      `SELECT p.id, p.url, p.title, p.word_count, p.client_id, c.name AS client_name
       FROM pages p JOIN clients c ON c.id = p.client_id
       WHERE p.id = $1 AND c.user_id = $2`,
      [id, userId],
    );
    const page = pageRes.rows[0];
    if (!page) return null;

    const keywords = await this.pool.query<{ text: string; relevance: number }>(
      `SELECT k.text, pk.relevance FROM page_keywords pk JOIN keywords k ON k.id = pk.keyword_id
       WHERE pk.page_id = $1 ORDER BY pk.relevance DESC`,
      [id],
    );
    const issues = await this.pool.query<{ code: string; severity: string; message: string }>(
      `SELECT code, severity, message FROM seo_issues WHERE page_id = $1
       ORDER BY CASE severity WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END, code`,
      [id],
    );
    return {
      id: page.id,
      url: page.url,
      title: page.title,
      wordCount: page.word_count,
      clientId: page.client_id,
      clientName: page.client_name,
      keywords: keywords.rows,
      issues: issues.rows,
    };
  }

  /** Position history for a page's keywords within a UTC range. Null if the page
   *  isn't owned by the user (tenancy). */
  async snapshotsForUser(
    pageId: number,
    userId: number,
    fromUtc: Date,
    toUtc: Date,
  ): Promise<KeywordSeries[] | null> {
    const owns = await this.pool.query(
      `SELECT 1 FROM pages p JOIN clients c ON c.id = p.client_id WHERE p.id = $1 AND c.user_id = $2`,
      [pageId, userId],
    );
    if (owns.rowCount === 0) return null;

    const rows = await this.pool.query<{ keyword: string; captured_at: Date; position: number }>(
      `SELECT k.text AS keyword, rs.captured_at, rs.position
       FROM rank_snapshots rs JOIN keywords k ON k.id = rs.keyword_id
       WHERE rs.page_id = $1 AND rs.captured_at >= $2 AND rs.captured_at < $3
       ORDER BY k.text, rs.captured_at`,
      [pageId, fromUtc, toUtc],
    );

    const byKeyword = new Map<string, KeywordSeries>();
    for (const row of rows.rows) {
      let series = byKeyword.get(row.keyword);
      if (!series) {
        series = { keyword: row.keyword, points: [] };
        byKeyword.set(row.keyword, series);
      }
      series.points.push({ capturedAt: row.captured_at.toISOString(), position: row.position });
    }
    return [...byKeyword.values()];
  }
}
