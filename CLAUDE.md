# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

This is a **take-home project, fully implemented** — an npm-workspaces monorepo with the `api` (Express + raw SQL) and `web` (React + Vite) apps plus the crawl worker, migrations, seed, and tests. The authoritative design lives in:

- `docs/project_description.md` — the original brief (requirements, constraints, grading signals). **Source of truth for *what* to build.**
- `docs/implementation-plan.md` — the architecture and execution plan.
- `docs/decisions.md` — the decision log (why key choices were made). **Append a short entry (title + 2-3 lines) whenever a significant decision is made.** Keep it terse; show reasoning, don't over-justify.
- `docs/database.md` — the schema source of truth (ER diagram + DDL + key queries); `api/db/migrations/*.sql` must match it.
- `docs/scaling.md` — the production evolution path per area (not built now; documents that the simplicity is a choice).
- `docs/heuristics.md` — the keyword (RAKE + zone-weighting) and SEO-issue heuristics, thresholds, and their Lighthouse/Yoast sources. Thresholds live in config, not hardcoded.
- `docs/design.md` — the design language (console layout + minimal finish) and the **theme-token system** (CSS custom properties). The source of truth for all colors/spacing/typography; never hardcode themeable values.

When these conflict with this file, the docs win and this file should be updated. When behaviour changes, keep the docs in sync (e.g. config thresholds, demo accounts, commands).

## Non-negotiable constraints

- **All file content is English-only.** Code, comments, docs, commit messages, README — everything. (The human collaborator converses in Portuguese, but every generated artifact is in English. This is a public submission to an English-speaking reviewer.)
- **Data access is raw SQL over `node-postgres` (`pg`) — no ORM (no Prisma).** See the "SQL over an ORM" entry in `docs/decisions.md`. Schema is plain SQL DDL in `api/db/schema.sql` + numbered `api/db/migrations/*.sql`. All queries go through a thin repository layer and are **100% parameterized** (`$1, $2, …`) — never interpolate user input into SQL. Hand-write TS row types + row→domain mappers (no generated types).
- **PostgreSQL is mandatory** and non-negotiable per the brief.
- **Tenancy is enforced in every data access**, scoped by `user_id` through `pages → clients → users`. Cross-user access (e.g. changing an id in the URL) must return **404, not 403** (do not leak existence).
- **Snapshot timestamps are stored in UTC**; the user is in **America/Toronto**. Convert for display and for date-range filtering — do not store local time.
- **Nothing about the seed sites may be hardcoded.** Sitemap discovery must work for any unseen website URL (see architecture below).
- **No hardcoded colors or common sizes in component CSS.** All themeable values come from **design tokens** (CSS custom properties: two-tier primitive→semantic) defined once in `web/src/styles/tokens.css`; CSS Modules use `var(--token)` only. Retuning or swapping the brand identity must be a single-file change. Recharts/JS reads tokens at runtime (no duplicated hex). See `docs/design.md`.
- **The seed must produce ≥ 50,000 `rank_snapshots` rows** and the app must stay responsive at that scale (indexes + hand-tuned hot queries).
- **The seed must never hard-fail on live-site hiccups.** It crawls semrush/yoast, so use timeouts + retries + a realistic UA and committed **fallback fixtures** (cached sitemap/HTML) — `npm run seed` has to succeed from a clean clone even if a site is slow/changed/blocking.
- **SSRF guard on any fetch of a user-supplied URL** (Add client / crawl): `http(s)` only; reject when the resolved IP is loopback/private/link-local/reserved; re-check on every redirect; cap timeout, response size, and `content-type` (html/xml).
- **Decisions are right-sized for the challenge scope.** When a choice would differ under real load, keep the scoped choice and document the evolution in `docs/scaling.md` — don't silently build for a scale the brief doesn't have.

## Workflow conventions (adopted from ProductiveShop)

- **GitFlow-like branching:** `main` (release) + `develop` + `feature/<name>`. Merge features via PR into `develop`.
- **Commit incrementally** ("commit as you go") with small, conventional commits — not one squashed commit at the end. This is an explicit grading criterion.
- Secrets live only in `.env` (git-ignored) with an `.env.example` of placeholders committed. Never commit real credentials.
- Keep modules small and single-purpose.
- The README must name the AI tools used and justify the SEO heuristics.

## Architecture (big picture)

An **npm-workspaces monorepo** with a clean backend/frontend split:

- **`api/`** — Express + TypeScript + `pg`. Request flow: `modules/<area>` (route + service) → `repositories/` (parameterized SQL) → `db/pool.ts`. Input validated with `zod`; session is a **JWT in an httpOnly SameSite=Lax cookie** (`/auth/login|logout|me`), so auth survives a refresh. The crawl **worker is a second entrypoint in this same workspace** (`src/worker.ts`), not a separate workspace — it reuses the db pool, repositories, crawl logic, and config. Two workspaces total (`api`, `web`), three processes (API, worker, web).
- **`web/`** — React + Vite + TS. Four screens behind login: Sign in, Pages list, Page detail, Add client. Dev uses a Vite proxy (`/api` → the API) so cookies stay same-origin.
- **Postgres** runs via `docker-compose.yml` (single service) for the reviewer.

Three subsystems carry most of the complexity and span multiple files — understand these first:

1. **Generic sitemap discovery (`api/src/crawl/sitemap.ts`)** — the graded core. From a bare website URL: read `robots.txt` `Sitemap:` lines (fallback to `/sitemap_index.xml`, `/sitemap.xml`), then **recurse through sitemap indexes**, scoring children for "blog-ness" (`+/blog`, `+post-sitemap`, `−tag|category|product|page`) and **preferring the input host** (to skip localized subdomains), until a posts `<urlset>` is reached. Take the first 15 URLs in document order. Must be fully generic — verified against semrush and yoast via fixtures, not special-cased.

2. **Crawl + extraction pipeline (`api/src/crawl/*`, `api/src/repositories/crawl-job-repository.ts`, `api/src/worker.ts`)** — `crawl-client.ts` orchestrates discover → fetch 15 pages (cheerio, bounded concurrency, politeness delay) → derive keywords and SEO issues (both are **documented heuristics**, not an external API) → persist. Adding a client enqueues a `crawl_jobs` row; a **separate worker entrypoint** drains the queue via `SELECT … FOR UPDATE SKIP LOCKED` (durable, and horizontally scalable by running N worker containers), driving the `crawl_status` state machine (`PENDING→CRAWLING→READY|FAILED`) + `pages_done`/`pages_total` progress. The frontend polls until `READY`; a reaper requeues jobs stuck past a visibility timeout. Adding a client creates **no** rank snapshots (only the seed does).

3. **Scale + the hot query (`api/src/repositories/page-repository.ts`, `seed/seed.ts`)** — the pages list needs each page's *latest position*. This is a `DISTINCT ON (page_id, keyword_id) … ORDER BY …, captured_at DESC` inside a CTE, backed by the composite index `(page_id, keyword_id, captured_at DESC)`. The seed bulk-loads ≥50k rows via `COPY` using a **seedable** RNG (reproducible random walk).

## Commands

Root scripts (npm workspaces, run from repo root):

```bash
# first run (reviewer)
npm run setup                # guided: DB choice, generate .env, migrate, seed, dev
#   …or manually:
docker compose up -d db      # start Postgres
npm install                  # installs all workspaces
npm run migrate              # apply api/db/migrations/*.sql via the runner
npm run seed                 # crawl seed sites + generate ≥50k snapshots (idempotent)
npm run dev                  # run api + worker + web together

# checks
npm run check                # lint + typecheck + tests
npm test -- sitemap          # run a single test file by name
```

The integration tests that need Postgres are gated by `RUN_DB_TESTS=1` (with a
test `DATABASE_URL`); without it they skip and the pure-logic tests still run.

**Target runtime: Node 24 LTS** (pinned via `.nvmrc`, `package.json` `engines`, and the CI matrix).
