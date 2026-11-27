# Implementation Plan: SEO Keyword Tracker (ProductiveShop take-home)

> Document for review. No code has been written yet.

## Context

Take-home for **ProductiveShop** (a B2B SaaS marketing agency: SEO, content, web, AI automation; *not* a software house). What they value: **pragmatism, fast delivery, readable code, explicit AI-tool usage, and SEO domain knowledge**, not over-engineering. The repo (`github.com/rodrigobruner/seo-keyword-tracker`). Deliverable = a complete web app + seed, pushed to a public repo, runnable from a clean clone.

**App goal:** an SEO keyword tracker for an agency. A user signs in, sees their client's website pages with the keywords each page likely ranks for plus its latest position, opens a page to see its position history over time, and points the crawler at a new URL. Four screens: Sign in · Pages list · Page detail · Add client.

**Stack (decided):** PostgreSQL · **Node + TypeScript + Express + `node-postgres` (`pg`) + raw SQL (no ORM)** (backend) · **React + Vite + TS** (frontend). Backend and frontend are **separate** in an npm-workspaces monorepo.

**Why raw SQL (no Prisma):** the brief explicitly evaluates **schema modeling** and **performance with ≥50k rows**; PostgreSQL is "required", an ORM is not mentioned. Raw SQL puts indexes, `DISTINCT ON`/window/CTE, and `EXPLAIN` front and centre, a direct signal of SQL proficiency. Also, ProductiveShop is a marketing agency (production is CMS/PHP, not Node/Prisma), so "mirror their stack" is not a goal. Mitigations for going ORM-free: **hand-written TS row types per table** + tested mappers; **100% parameterized queries** (`$1, $2, …`) so there is no injection; `zod` validates API input. See `docs/decisions.md` (ADR-0001).

### ProductiveShop alignment (patterns adopted deliberately)
- **GitFlow-like** branching: `main` (release) + `develop` + `feature/<name>`; PRs with descriptive title + changelog; small, incremental conventional commits (this matches the brief's "commit as you go").
- **GitHub Actions CI** (`.github/workflows/ci.yml`): install + lint + typecheck + test on PR/push.
- Secrets only in `.env` (git-ignored) + `.env.example`; never commit credentials.
- Small modules (hundreds of lines max), single responsibility.
- README names the AI tools used (Claude Code) and justifies the SEO heuristics.

---

## Research facts anchoring the design

**Local toolchain:** Node 20.20 / npm 10.8 (the dev sandbox only; the **project targets Node 24 LTS**, see `decisions.md`). **No Postgres, no Docker, no psql in the sandbox**, so here we can run `npm install`, `tsc`, `eslint`, `vitest` (pure logic with fixtures); migrations/seed/e2e run on the reviewer's machine via docker-compose.

**Sitemap discovery (the evaluated core), confirmed non-trivial:**
- `yoast.com/robots.txt` → `Sitemap: https://yoast.com/sitemap_index.xml` (an index) → children include `post-sitemap.xml`, `post-sitemap2.xml` (posts) + traps to avoid: `post_tag-sitemap.xml`, `page-sitemap.xml`, `product-sitemap.xml`.
- `semrush.com/robots.txt` → `Sitemap: https://www.semrush.com/sitemap.xml` (an index) → English blog child = `https://www.semrush.com/blog/sitemap/` (avoid localized subdomains `de./fr./pt./es./it./ja.`). That `/blog/sitemap/` may itself be **another index**, so recursion is needed until a `<urlset>` of posts is reached.
- Conclusion: a generic algorithm with recursion into indexes + "blog-ness" scoring + preference for the input host. **Nothing hardcoded.**

---

## Monorepo layout (npm workspaces)

```
seo-keyword-tracker/
  package.json            # workspaces ["api","web"]; root scripts (dev/seed/migrate/docker)
  infra/                  # all container infra (used by the reviewer)
    docker-compose.yml        # db + api + worker + web; `up -d db` for just Postgres
    api.Dockerfile            # one image, four roles (api/worker/migrate/seed)
    web.Dockerfile            # builds the SPA, serves it with nginx
    nginx.conf                # static SPA + proxy /api -> api
  .env.example            # DATABASE_URL, SESSION_SECRET, PORT, WEB_ORIGIN
  .github/workflows/ci.yml
  README.md               # 1 page: how to run, decisions, unfinished, AI tools
  docs/project_description.md  # (already exists)
  api/
    db/
      schema.sql              # full DDL (reference): CREATE TABLE/INDEX/constraints
      migrations/             # 0001_init.sql, 0002_*.sql (numbered, forward-only)
      migrate.ts              # idempotent runner (_migrations table tracks applied files)
    src/
      index.ts                config/env.ts (zod)  db/pool.ts  (pg Pool)
      db/types.ts             # row types per table + mappers (row→domain)
      repositories/           # userRepo, clientRepo, pageRepo, snapshotRepo (parameterized SQL)
      middleware/auth.ts       middleware/error.ts
      modules/auth/*           (login/logout/me, httpOnly cookie)
      modules/clients/*        (list, create→triggers crawl)
      modules/pages/*          (list w/ filter+search+pagination; detail w/ history)
      crawl/sitemap.ts         (generic discovery)
      crawl/fetchPage.ts       (fetch + cheerio)
      crawl/keywords.ts        (keyword heuristic)
      crawl/issues.ts          (SEO issue detection)
      crawl/crawlClient.ts     (orchestrates: discover→first15→extract→persist)
      jobs/crawl-queue.ts      (enqueue + SKIP LOCKED dequeue + reaper SQL helpers)
      worker.ts                (separate entrypoint: dequeue loop → crawlClient; runs embedded in dev, own container in prod)
      seed/seed.ts
    tests/ (vitest): sitemap, keywords, issues, tz, tenancy, sql-mappers
  web/
    src/
      main.tsx  App.tsx  router
      lib/api.ts (fetch w/ credentials)  lib/auth.tsx (context)
      pages/SignIn.tsx  Pages.tsx (list)  PageDetail.tsx  AddClient.tsx
      components/* (table, pagination, filters, history chart/table)
    vite.config.ts  (proxy /api → localhost:4000, same-origin cookies in dev)
```

> **Two workspaces, three processes.** The crawl **worker is a second entrypoint in the `api` workspace** (`api/src/worker.ts`), not a separate workspace. It reuses the API's db pool, repositories, crawl logic, and config. Prod builds one image and runs two commands from it (`dist/index.js` = API, `dist/worker.js` = worker), scaled independently. `web` is its own workspace (different toolchain).

---

## Schema (SQL DDL / PostgreSQL): the 6 domain entities

`db/schema.sql` (summary; `citext` for case-insensitive email and keyword):

```sql
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
  id            bigserial PRIMARY KEY,
  email         citext UNIQUE NOT NULL,
  password_hash text   NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE clients (
  id           bigserial PRIMARY KEY,
  user_id      bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         text   NOT NULL,
  website_url  text   NOT NULL,
  host         text   NOT NULL,                       -- normalized for dedupe
  crawl_status text   NOT NULL DEFAULT 'PENDING'
                 CHECK (crawl_status IN ('PENDING','CRAWLING','READY','FAILED')),
  crawl_error  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, host)
);

CREATE TABLE pages (
  id         bigserial PRIMARY KEY,
  client_id  bigint NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  url        text   NOT NULL,
  title      text,
  word_count int,
  fetched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, url)
);

CREATE TABLE keywords (
  id   bigserial PRIMARY KEY,
  text citext UNIQUE NOT NULL                          -- global dedupe
);

CREATE TABLE page_keywords (                           -- "page is likely to rank for"
  page_id    bigint NOT NULL REFERENCES pages(id)    ON DELETE CASCADE,
  keyword_id bigint NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  relevance  real   NOT NULL,
  PRIMARY KEY (page_id, keyword_id)
);

CREATE TABLE seo_issues (
  id         bigserial PRIMARY KEY,
  page_id    bigint NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  code       text   NOT NULL,
  severity   text   NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH')),
  message    text   NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rank_snapshots (
  id          bigserial PRIMARY KEY,
  page_id     bigint   NOT NULL REFERENCES pages(id)    ON DELETE CASCADE,
  keyword_id  bigint   NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  captured_at timestamptz NOT NULL,                     -- UTC
  position    smallint NOT NULL CHECK (position BETWEEN 1 AND 100)
);
CREATE INDEX idx_snap_page_kw_time ON rank_snapshots (page_id, keyword_id, captured_at DESC);
CREATE INDEX idx_pages_client       ON pages (client_id);
CREATE INDEX idx_pagekw_keyword     ON page_keywords (keyword_id);  -- search by keyword
```

**Tenancy:** every access is scoped by `user_id` through pages→clients→users, in parameterized SQL. Detail:
```sql
SELECT p.* FROM pages p JOIN clients c ON c.id = p.client_id
WHERE p.id = $1 AND c.user_id = $2;   -- no row → 404 (does not leak existence)
```
A unit test proves User A cannot reach User B's page by changing the id in the URL.

---

## Screens × endpoints

1. **Sign in**: `POST /auth/login` (email+password; bcrypt), `POST /auth/logout`, `GET /auth/me`. Session = **JWT in an httpOnly, SameSite=Lax cookie** that persists across refresh (web calls `/auth/me` on boot). Everything sits behind login.
2. **Pages list**: `GET /pages?clientId&q&page&pageSize`. Shows the page's keywords, issue count, and **latest position**. Filter by client, search by URL **or** keyword (ILIKE with join), offset pagination + total. Scoped by userId.
3. **Detail**: `GET /pages/:id` (keywords + issues) and `GET /pages/:id/snapshots?from&to` (history over the range). Frontend renders a table **or** a line chart (position × date).
4. **Add client**: `POST /clients` validates the URL (rejects invalid), dedupes `(userId, host)`, creates `Client(PENDING)`, enqueues the crawl, returns 201; `GET /clients` / `GET /clients/:id` lets the frontend **poll** until `READY`. **Creates no snapshots** (only the next seed does, per the brief).

---

## Generic sitemap discovery (`crawl/sitemap.ts`)

1. Normalize input → origin; validate `http(s)` **and that the resolved host is public** (reject loopback/private/link-local/reserved IPs, the SSRF guard). Re-check this on every redirect; cap timeout + response size + `content-type` (html/xml).
2. Candidates: `GET /robots.txt` → `Sitemap:` lines. If none, fall back to `/sitemap_index.xml`, `/sitemap.xml`, `/sitemap-index.xml`.
3. Resolve down to the posts `<urlset>` (fast-xml-parser):
   - `<sitemapindex>` → collect child `<sitemap><loc>`; **score blog-ness**: `+/blog`, `+post-sitemap`, `+article|news`; `−tag|category|author|product|page-sitemap`; **+prefer the same host** as the input (avoids localized subdomains). Recurse into the best candidate (may be another index, e.g. semrush `/blog/sitemap/`).
   - `<urlset>` → posts leaf.
4. Collect `<url><loc>` in **document order**, take the **first 15**.
5. Nothing found → `NoSitemapError` → `Client.crawl_status = FAILED` (covers "not every site has a sitemap where you expect").

**Fetch + extraction (`fetchPage.ts`/`keywords.ts`/`issues.ts`):** native `fetch` (UA, timeout), concurrency ~3 + small delay (politeness). cheerio for parsing.
- **Keywords (documented heuristic):** RAKE-style candidate phrases per zone + SEO zone-weighting (title 5, h1 4, meta 3, h2/h3 & slug 2, body 1); keep score ≥ 2; top 15; `relevance` normalized 0..1. Optional corpus TF-IDF across the 15 pages (time-permitting). Full spec + sources in `docs/heuristics.md`.
- **Issues (documented checks):** thresholds aligned to Lighthouse/Yoast: title missing/<30/>60; meta missing/<120/>160; single H1; images missing alt (count); thin < 300 words; canonical; viewport; `NOINDEX` (HIGH); `NON_DESCRIPTIVE_LINKS` (LOW); optional `KEYWORD_STUFFING`. Each produces `{code, severity, message}`. See `docs/heuristics.md`.

---

## Scale (≥50k snapshots, responsive) + timezone

- 2 users × 1 client × 15 pages = 30 pages; ~8 keywords/page ⇒ ~240 pairs. Seed generates **one per pair per day** over `ceil(50000/pairs)+margin` (~**400 days**), which guarantees ≥50k rows regardless of the pair count. Bulk insert via batched multi-row `unnest` inserts (~10k rows/batch). **Seedable** RNG (random walk 1..100, small daily deltas) for reproducible and realistic charts.
- **Latest position (hot path, list):** SQL with `DISTINCT ON (page_id, keyword_id) … ORDER BY page_id, keyword_id, captured_at DESC` to get each pair's latest, inside a CTE, then aggregate per page to the **best (lowest) position on the most recent date**. Fast on the `(page_id, keyword_id, captured_at DESC)` index; `EXPLAIN ANALYZE` documented in the README (note: materialized `rank_latest` if it grows a lot).
- **Timezone:** `captured_at` in **UTC** (timestamptz). Display converted to **America/Toronto** (client, `Intl` with `timeZone`); date filter converts the picked Toronto dates to UTC bounds (server, `AT TIME ZONE`). Both read the **same configured zone** (a single env constant, default `America/Toronto`); the server stays otherwise pure-UTC. Convention explained in the README.

---

## Async crawl (worker + Postgres queue)

`POST /clients` inserts the client (`PENDING`) + a `crawl_jobs` row and responds immediately. A separate **`worker.ts`** entrypoint runs a dequeue loop (`SELECT … FOR UPDATE SKIP LOCKED`) → `crawlClient` → `CRAWLING → discover → 15 pages (≈3 concurrent) → persist → READY|FAILED`, updating `client.crawl_status` + `pages_done`/`pages_total` as it goes. Best-effort per page: `READY` with whatever succeeded, `FAILED` only on discovery failure or zero pages. Durable (jobs survive restarts) and horizontally scalable (run N worker containers; `SKIP LOCKED` keeps them from colliding); a reaper requeues jobs stuck past a visibility timeout. The worker runs embedded in `npm run dev` and as its own container in prod. No rank snapshots here (seed only). This is deliberately right-sized-plus for the challenge (durable/scalable pattern, zero new infra); the scale path is in `scaling.md` and a plain in-process queue is the fallback if time is tight.

---

## Auth / seed / CI / git

- **Auth:** bcrypt for hashing; JWT in httpOnly cookie; CORS with credentials only in prod (dev uses the Vite proxy, same-origin).
- **Seed (`seed/seed.ts`, committed, idempotent):** upsert 2 users (creds in README) + 2 clients (semrush, yoast), runs **the same** crawl routine, generates the snapshots (≥50k) via batched `unnest` inserts. **Resilient to live sites:** timeouts + retries + realistic UA, and committed **fallback fixtures** (cached sitemap/HTML) so it never hard-fails if semrush/yoast is slow, changed, or blocks us.
- **CI (`.github/workflows/ci.yml`):** install → eslint → tsc → vitest on PR/push to `develop`.
- **Git:** `main` + `develop` + `feature/*`; incremental PRs; `.env.example` with no secrets.

---

## Phasing (execution order)

1. Scaffold monorepo + env + docker-compose + `db/schema.sql` + `migrations/0001_init.sql` + `migrate.ts` runner + CI skeleton.
2. `crawl/sitemap.ts` + `keywords.ts` + `issues.ts` + **vitest tests** (semrush/yoast fixtures): the evaluated core, test-first.
3. Auth (login/me/logout + cookie) + tenancy middleware.
4. Clients (create + crawl queue + status) + `crawlClient.ts`.
5. Pages (list w/ filter/search/pagination + latest-position query) + detail + snapshots.
6. Seed (crawl + ≥50k generation), idempotent + reproducible.
7. Frontend: 4 screens + auth context + history chart/table.
8. README (1 page) + polish + commit-history review.
9. **Release:** merge `develop → main` (`--no-ff`) so `main` is the submittable version, the default branch the reviewer clones. Until this step `main` stays at the baseline (behind `develop`) by design.

---

## Verification

- **In the sandbox (no Postgres):** `npm install`, `tsc --noEmit` (api+web), `eslint`, `vitest`. This covers the pure logic: sitemap discovery (fixtures → picks the semrush/yoast blog leaf, avoids traps, prefers host, fallback), keyword extraction, issue detection, tz conversion, row→domain mappers, and the tenancy guard (detail SQL filters by `user_id`). The hot queries (`DISTINCT ON`, pagination) are validated by the reviewer with `EXPLAIN ANALYZE` (they need Postgres).
- **On the reviewer's machine (full stack):** `docker compose -f infra/docker-compose.yml up -d db` → `npm install` → `npm run migrate` → `npm run seed` → `npm run dev` (or run everything in containers with `npm run docker:up`). Validate: login persists across refresh; the list filters/searches/paginates and isolates by user (changing the id in the URL → 404); detail shows history over the range; adding a brand-new client (an unseen URL) discovers the sitemap, crawls 15, and shows up with no snapshots.
- **Integration test (needs a disposable Postgres):** supertest hits the API and asserts cross-user access → 404 (tenancy), login/session round-trip, and a client-create → crawl → READY happy path. This is the real proof for the graded tenancy criterion.
- **Scale check:** `SELECT count(*) FROM rank_snapshots` ≥ 50000; list and detail respond fast (index in place).
