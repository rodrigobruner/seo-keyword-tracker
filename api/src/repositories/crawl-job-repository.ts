import type { Pool } from 'pg';

// The durable crawl queue (crawl_jobs). Jobs are claimed with
// SELECT ... FOR UPDATE SKIP LOCKED, so N workers can drain it concurrently
// without colliding. See docs/database.md.

export interface CrawlJob {
  id: number;
  clientId: number;
  websiteUrl: string;
}

export interface CrawlJobRepository {
  enqueue(clientId: number): Promise<void>;
  /** Atomically claim the next due job (pinned to this worker), or null. */
  claimNext(workerId: string): Promise<CrawlJob | null>;
  complete(jobId: number): Promise<void>;
  /** Requeue (with backoff) if attempts remain, else mark FAILED. */
  fail(jobId: number, error: string): Promise<void>;
  /** Requeue jobs stuck in RUNNING past the visibility timeout. Returns count. */
  reapStuck(visibilityTimeoutMs: number): Promise<number>;
}

interface JobRow {
  id: number;
  client_id: number;
  website_url: string;
}

export class PgCrawlJobRepository implements CrawlJobRepository {
  constructor(private readonly pool: Pool) {}

  async enqueue(clientId: number): Promise<void> {
    await this.pool.query(`INSERT INTO crawl_jobs (client_id) VALUES ($1)`, [clientId]);
  }

  async claimNext(workerId: string): Promise<CrawlJob | null> {
    const res = await this.pool.query<JobRow>(
      `WITH next AS (
         SELECT id FROM crawl_jobs
         WHERE status = 'QUEUED' AND run_after <= now()
         ORDER BY run_after
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       UPDATE crawl_jobs j
       SET status = 'RUNNING', attempts = attempts + 1, locked_at = now(),
           locked_by = $1, started_at = COALESCE(j.started_at, now()), updated_at = now()
       FROM next JOIN clients c ON TRUE
       WHERE j.id = next.id AND c.id = j.client_id
       RETURNING j.id, j.client_id, c.website_url`,
      [workerId],
    );
    const row = res.rows[0];
    if (!row) return null;
    return { id: row.id, clientId: row.client_id, websiteUrl: row.website_url };
  }

  async complete(jobId: number): Promise<void> {
    await this.pool.query(
      `UPDATE crawl_jobs SET status = 'DONE', finished_at = now(), updated_at = now() WHERE id = $1`,
      [jobId],
    );
  }

  async fail(jobId: number, error: string): Promise<void> {
    // attempts was already incremented on claim; retry with exponential backoff
    // while attempts remain, otherwise FAILED.
    await this.pool.query(
      `UPDATE crawl_jobs
       SET status = CASE WHEN attempts < max_attempts THEN 'QUEUED' ELSE 'FAILED' END,
           last_error = $2,
           run_after = now() + (interval '30 seconds' * attempts),
           updated_at = now()
       WHERE id = $1`,
      [jobId, error.slice(0, 500)],
    );
  }

  async reapStuck(visibilityTimeoutMs: number): Promise<number> {
    const res = await this.pool.query(
      `UPDATE crawl_jobs
       SET status = 'QUEUED', locked_at = NULL, locked_by = NULL, updated_at = now()
       WHERE status = 'RUNNING'
         AND attempts < max_attempts
         AND locked_at < now() - ($1::bigint * interval '1 millisecond')`,
      [visibilityTimeoutMs],
    );
    return res.rowCount ?? 0;
  }
}
