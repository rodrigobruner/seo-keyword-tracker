import type { Pool } from 'pg';

export interface ClientSummary {
  id: number;
  name: string;
  websiteUrl: string;
  host: string;
  crawlStatus: string;
  crawlError: string | null;
  pagesTotal: number | null;
  pagesDone: number;
  pageCount: number;
}

interface ClientRow {
  id: number;
  name: string;
  website_url: string;
  host: string;
  crawl_status: string;
  crawl_error: string | null;
  pages_total: number | null;
  pages_done: number;
  page_count: number;
}

const SELECT = `
  SELECT c.id, c.name, c.website_url, c.host, c.crawl_status, c.crawl_error,
         c.pages_total, c.pages_done,
         (SELECT count(*)::int FROM pages p WHERE p.client_id = c.id) AS page_count
  FROM clients c`;

function mapClient(r: ClientRow): ClientSummary {
  return {
    id: r.id,
    name: r.name,
    websiteUrl: r.website_url,
    host: r.host,
    crawlStatus: r.crawl_status,
    crawlError: r.crawl_error,
    pagesTotal: r.pages_total,
    pagesDone: r.pages_done,
    pageCount: r.page_count,
  };
}

export class ClientRepository {
  constructor(private readonly pool: Pool) {}

  async listForUser(userId: number): Promise<ClientSummary[]> {
    const res = await this.pool.query<ClientRow>(
      `${SELECT} WHERE c.user_id = $1 ORDER BY c.created_at DESC`,
      [userId],
    );
    return res.rows.map(mapClient);
  }

  async findByIdForUser(id: number, userId: number): Promise<ClientSummary | null> {
    const res = await this.pool.query<ClientRow>(
      `${SELECT} WHERE c.id = $1 AND c.user_id = $2`,
      [id, userId],
    );
    const row = res.rows[0];
    return row ? mapClient(row) : null;
  }

  /** Create a client, or 'duplicate' if the user already has this host. */
  async create(
    userId: number,
    name: string,
    websiteUrl: string,
    host: string,
  ): Promise<{ id: number } | 'duplicate'> {
    try {
      const res = await this.pool.query<{ id: number }>(
        `INSERT INTO clients (user_id, name, website_url, host) VALUES ($1, $2, $3, $4) RETURNING id`,
        [userId, name, websiteUrl, host],
      );
      return { id: res.rows[0]!.id };
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
        return 'duplicate'; // unique (user_id, host)
      }
      throw err;
    }
  }

  /** Delete a client the user owns. Cascades to its pages, keywords links, issues,
   *  rank snapshots and crawl jobs (FKs are ON DELETE CASCADE). Returns false if
   *  the client doesn't exist or isn't the user's (caller maps to 404). */
  async deleteForUser(id: number, userId: number): Promise<boolean> {
    const res = await this.pool.query(`DELETE FROM clients WHERE id = $1 AND user_id = $2`, [
      id,
      userId,
    ]);
    return (res.rowCount ?? 0) > 0;
  }
}
