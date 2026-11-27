# Scaling & evolution

What would change if this grew into a real product with real SERP volume, multi-tenant teams, and many engineers. **Only the differences from today's design are listed; anything not mentioned stays as in `decisions.md` / `database.md`.** None of this is built now; the simplicity is a choice. A few items may be pulled forward during development if time allows.

Format per area: **Trigger** (what forces the change) → **Change**.

---

## Data model

**IDs**: Exposed on public/shared URLs → add opaque external ids (UUID/ULID) at the API boundary (`bigint` stays internal), stopping enumeration and business-volume leakage.

**`rank_snapshots`**: Tens of millions+ of rows → range-partition by time (monthly) or move to a time-series store (TimescaleDB/ClickHouse); add rollups (daily→weekly/monthly) + retention; replace the computed latest-position with a maintained `rank_latest` table/matview updated on write.

**Timezone**: Users outside Toronto → make the display timezone a per-user preference instead of a fixed America/Toronto.

**`seo_issues`**: Need to filter/aggregate by type, tune severity centrally, or translate messages → promote to a catalog (`issue_type`: code, default severity, remediation, i18n message) + instances referencing it.

**`position`**: Real SERP data → allow `>100` / `NULL` ("not ranking") and add dimensions (location, device, search engine, SERP features), splitting the snapshot grain.

**Rank ingestion** (today the positions are simulated by a seeded random walk in the seed): Real positions needed → replace the random walk with a **daily refresh** that writes real positions into the **same `rank_snapshots` table**, so the history model does not change. The refresh reuses the queue already built: a lightweight scheduler enqueues one `RANK_REFRESH` job per client per day on the existing `crawl_jobs` queue (a new job type), and the same `SKIP LOCKED` worker drains it, inheriting the durability, retries, observability, and horizontal scale the crawl pipeline already has. The job is idempotent for free: `rank_snapshots` is keyed by `(page_id, keyword_id, captured_at)` at day grain, so re-running a day upserts (`ON CONFLICT`) instead of duplicating. Source, cheapest first: **Google Search Console API** as the default (free, real positions for the client's own verified site, no per-keyword cost), then a **paid SERP API** (DataForSEO/Semrush) as an upgrade when competitor sites or arbitrary keywords must be tracked. The paid source makes each check cost money, which introduces a "tracked keyword" concept the app does not have today (now every extracted keyword is implicitly tracked): `page_keywords` gains a `tracked` flag, or a small tracking-config table, so only a curated set is refreshed. A per-run record (the `crawl_jobs` pattern, or a dedicated `rank_refresh_runs` table) captures when each refresh ran, its outcome, and its cost.

**Deletes**: Recovery/audit/compliance matter → soft-delete (`deleted_at`) + audit trail (`created_by`, `updated_at`, history) instead of hard cascades.

## Tenancy

Agency is a team sharing clients → orgs/teams with membership + RBAC; consider Postgres RLS for hard per-tenant isolation; read replicas + caching on the read paths.

## Authentication

Sessions must be revocable, or need reset/verification/compliance → refresh tokens with rotation + a revocation/session store; password reset + email verification; MFA; login rate-limit + lockout.

**Password hashing under load**: `bcryptjs` (pure JS) runs on the main thread (its async form chunks via `setImmediate`, so it doesn't hard-block, but still burns the single thread), capping login throughput. Swap to native `bcrypt` (libuv threadpool, truly off-thread) or offload hashing to a worker thread when auth volume grows.

## Crawl pipeline

Already durable + horizontally scalable (Postgres `crawl_jobs` + `SKIP LOCKED` workers; add worker containers for throughput). The remaining lever is broker-grade features → move to a dedicated broker (SQS/BullMQ/Temporal) for priorities, delayed jobs, dead-letter queues, and cross-service fan-out; add per-host rate-limiting + robots-`crawl-delay` compliance and scheduled re-crawls.

**Per-job wall-time**: pages are fetched sequentially (≤10s each), so a slow site's worst case drives the job-visibility timeout up (10min today). Bounded-concurrency page fetching (e.g. 4 at a time, politeness-capped per host) would cut wall-time and let the visibility window shrink. Minor: `zlib.gunzipSync` on a `.xml.gz` sitemap blocks the worker loop briefly; switch to async gunzip if gzipped sitemaps become common.

**Sitemap-discovery boundary (by design):** non-root sitemaps are found only when *declared*, via robots.txt `Sitemap:`, a homepage `<link rel="sitemap">`, or as an index child (all handled). An undeclared sitemap at a non-root path (e.g. `/catalog/sitemap.xml` with nothing pointing to it) is not found, because blind path-probing stays root-only. Guessing arbitrary paths is combinatorial and is exactly what the spec's declaration mechanism exists to avoid. Production could close the tail via Search Console / Bing Webmaster sitemap APIs (authenticated per-site submissions) rather than heuristics.

## Keyword & issue logic

On-page heuristics aren't accurate enough → real SERP/keyword data + ML ranking; issue checks backed by a rules engine and real audits (Lighthouse/crawl diagnostics).

## Data access

Hand-written SQL becomes a team maintainability cost → adopt a typed query builder (Kysely), still SQL-first, no full ORM.

**Connection pressure**: the pool has fixed query/connection timeouts (a stuck query can't hold a connection, and a request fails fast when the pool is drained). At scale, tune `max`/timeouts per env and front Postgres with a pooler (PgBouncer) + read replicas for the read-heavy list/detail queries.

## Infrastructure & deployment

Today one `infra/docker-compose.yml` runs the whole stack locally (db + api + worker + web). What changes for a real deployment:

**Images**: The api and worker are already one image with two entrypoints. In production they become two deployments of that image, scaled independently: the api scales on request load, the worker scales on crawl-queue depth (and later the daily `RANK_REFRESH` jobs). The `SKIP LOCKED` queue makes N workers safe, so more throughput is just more worker replicas.

**Web**: The SPA is static, so in production it does not need the nginx container. The built assets go to object storage behind a CDN (S3 + CloudFront), and the load balancer routes `/api` to the API so the browser stays same-origin (keeping the httpOnly SameSite=Lax cookie). The nginx image stays handy for a simple single-host deploy.

**Database**: The Postgres container is for local use only. Production uses managed Postgres (RDS / Cloud SQL) with backups and failover. Every api and worker replica holds a `pg` pool, so `replicas × pool size` can exhaust `max_connections`: front it with PgBouncer, and add read replicas for the read-heavy list/detail queries (see Data access).

**Migrations**: Run as a one-off step before the rollout (the compose `migrate` service is the same idea), never from each app container on boot, so replicas do not race to apply the same migration.

**Orchestration**: compose is for local. Production runs on ECS/Fargate, Kubernetes, or a PaaS, with health checks, rolling deploys (the worker already drains its current job on SIGTERM), and secrets from a managed store instead of env defaults. The api is stateless (JWT in a cookie, no server session), so it scales horizontally behind a load balancer with nothing to share.

## Security

The take-home already covers the OWASP basics (see `decisions.md` → "Security posture"). Beyond the items already noted under **Authentication** (refresh/rotation/revocation, MFA, reset/verification, lockout) and **Tenancy** (Postgres RLS):
- Real users/compliance → immutable **audit log** of security-relevant actions (login, client create, cross-tenant attempts).
- Production secrets → a managed **secret store** with rotation instead of a single `SESSION_SECRET` in `.env`.
- Hardening pipeline → automated **dependency scanning + SAST/DAST** in CI, and a **WAF / managed rate-limiting** at the edge.
- Frontend on a different origin than the API → explicit **CSRF tokens** (double-submit); today SameSite=Lax + same-origin suffices.
- **Content-Security-Policy on the SPA**: `helmet` sets CSP on API responses, but the static web app has none. XSS risk is already low (React escapes everything, no `dangerouslySetInnerHTML`, external links use `rel="noopener noreferrer"`), so a strict CSP (plus `X-Content-Type-Options`, `Referrer-Policy`) served as headers from the web host would be defense-in-depth.
- **Per-user quotas**: beyond the create rate-limit, cap total clients / concurrent crawl jobs per user (or per org) to bound abuse and cost.
