# SEO Keyword Tracker

A small SEO keyword tracker for a marketing agency. A user signs in and sees their client's crawled pages. Each page shows the keywords it likely ranks for, the SEO issues found on it, and its rank position over time. The user can also point the crawler at a new website to pull it in.

Take-home built with **Node + TypeScript** (Express, **raw SQL on PostgreSQL**) and **React** (Vite). This README is the map; the full design lives in [`docs/`](docs/).

## Stack

PostgreSQL · Node 24 (LTS) + TypeScript + Express + `node-postgres` (raw SQL, **no ORM**) · React + Vite + TS + CSS Modules + TanStack Query + Recharts · npm-workspaces monorepo (`api` + `web`). The crawl worker is a second entrypoint of `api` that drains a Postgres `SKIP LOCKED` queue.

## How to run

You need **Node 24**. The quickest path is the guided setup. It asks whether to use Docker or your own Postgres, generates `.env` (with secrets), runs the migrations, optionally seeds the database, and can start the app for you.

```bash
# 1. Clone the repo
git clone https://github.com/rodrigobruner/seo-keyword-tracker.git

# 2. Enter the project folder
cd seo-keyword-tracker

# 3. Run the guided setup
npm run setup
```

<details>
<summary>Prefer to do it manually?</summary>

You need **Docker** (for PostgreSQL). From a clean clone:

```bash
# 1. Configure: copy the template and set a demo password
cp .env.example .env
#    Edit .env and set SEED_PASSWORD to a password of your choice.
#    It becomes the login for the demo accounts the seed creates (no default).

# 2. Start PostgreSQL
docker compose -f infra/docker-compose.yml up -d db

# 3. Install, create the schema, and seed
npm ci
npm run migrate      # applies db/migrations/*.sql
npm run seed         # crawls the seed sites and generates 50k+ rank snapshots (a few minutes)

# 4. Run everything (API :4000 · worker · web :5173)
npm run dev
```

</details>

<details>
<summary>Prefer to run the whole stack in Docker?</summary>

The `infra/` folder holds everything: PostgreSQL, the API, the crawl worker, and the web app behind nginx. You only need Docker.

```bash
# 1. Build and start db + migrate + api + worker + web
npm run docker:up        # docker compose -f infra/docker-compose.yml up --build

# 2. (optional) seed the demo data
npm run docker:seed      # crawls the seed sites and generates 50k+ snapshots

# 3. Open the app
open http://localhost:8080
```

The app and worker share one image (two entrypoints); the web image serves the built SPA and proxies `/api` to the API. The compose file uses dev-only defaults; override `SESSION_SECRET` / `SEED_PASSWORD` via your shell for anything real. Stop it with `npm run docker:down`.

</details>

**Demo accounts.** The seed creates them. The password is the `SEED_PASSWORD` you set in `.env`:

| Email | Client |
|---|---|
| `demo@semrush.com` | Semrush (https://www.semrush.com) |
| `demo@yoast.com` | Yoast (https://yoast.com) |

Run the whole check suite (lint + typecheck + tests) with `npm run check`.

## Data: what's real vs simulated

Per the brief, *"positions are invented… the pages and keywords are not invented, they come from the live website."* So:

- **Real:** the pages (crawled from the live site), the likely **keywords** (RAKE over the actual HTML), and the **SEO issues** (detected from the markup). Sitemap discovery runs against any site, with nothing hardcoded.
- **Simulated:** the **rank positions over time** come from a seeded random walk, not real SERP data. The seed exercises the full data model, the scale (50k+ snapshots), and the charts without a paid SERP API. Swapping in a real source (for example Search Console) only changes who fills `rank_snapshots.position`.

## Documentation

| Document | What it covers |
|---|---|
| [docs/project_description.md](docs/project_description.md) | The original brief (requirements, constraints). |
| [docs/implementation-plan.md](docs/implementation-plan.md) | Architecture, monorepo layout, endpoints, phasing, verification. |
| [docs/decisions.md](docs/decisions.md) | Decision log: every choice and the reasoning, kept terse. |
| [docs/database.md](docs/database.md) | Schema: ER diagram, DDL, the hot queries, modeling notes. |
| [docs/design.md](docs/design.md) | Design language and the theme-token system (ProductiveShop-aligned). |
| [docs/heuristics.md](docs/heuristics.md) | Keyword (RAKE + zone-weighting) and SEO-issue heuristics, plus their sources. |
| [docs/scaling.md](docs/scaling.md) | Production evolution path per area (deliberately not built now). |
| [CLAUDE.md](CLAUDE.md) | Guardrails and architecture guide for AI/dev agents in this repo. |

## Decisions, at a glance

Raw SQL (no ORM) to showcase schema and performance · single repo, two workspaces · worker plus a Postgres `SKIP LOCKED` queue for crawling · JWT-in-httpOnly-cookie auth · timezone fixed to America/Toronto (per the brief) · SEO thresholds aligned to Lighthouse/Yoast · console UI on a brand-aligned theme-token system. Every choice is sized to the challenge; the scale path for each is in [`docs/scaling.md`](docs/scaling.md). Full rationale in [`docs/decisions.md`](docs/decisions.md).

## Unfinished / what's next

- **Rank data is simulated** by design (the brief says positions are invented). In production the same `rank_snapshots` table would be filled from Google Search Console or a SERP API on a schedule, with no schema change, just a new source.
- **Column sorting:** the pages endpoint already supports `sort`/`dir` (with a safe allowlist), but the UI doesn't expose it yet. Wiring clickable headers is the obvious next step.
- **Frontend tests:** the backend has unit and DB-integration tests; the frontend has none by scope. A Vitest + Testing Library harness over the pages and add-client flows would be next.
- The production evolution for every area (auth revocation/MFA, partitioning `rank_snapshots`, per-user timezone, a CSP on the SPA, per-user crawl quotas, and more) is laid out in [`docs/scaling.md`](docs/scaling.md), deliberately not built for this scope.

## AI tools

Built with **Claude Code** (Claude Opus), used throughout: architecture and planning, the documentation, the implementation, and two rounds of code review. Commits carry a `Co-Authored-By` trailer for transparency.

## Git workflow

GitFlow-style: `main` (release) · `develop` (integration) · `feature/*` and `fix/*` branches merged into `develop` via PRs, with small incremental commits. `main` holds the complete, runnable app.
