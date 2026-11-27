# SEO Keyword Tracker

A small SEO keyword tracker for a marketing agency. A user signs in and sees their client's crawled pages, each with the keywords it likely ranks for, the SEO issues found on it, and its rank position over time — and can point the crawler at a new website to pull it in.

Take-home built with **Node + TypeScript** (Express, **raw SQL on PostgreSQL**) and **React** (Vite). This README is the map; the full design lives in [`docs/`](docs/).

## Status

**Planning complete; implementation in progress.** The architecture, database schema, SEO heuristics, and design system are fully specified and decided (see the [decision log](docs/decisions.md)). Run instructions below are filled in as the app is scaffolded.

## Stack

PostgreSQL · Node 24 (LTS) + TypeScript + Express + `node-postgres` (raw SQL, **no ORM**) · React + Vite + TS + CSS Modules + TanStack Query + Recharts · npm-workspaces monorepo (`api` + `web`; the crawl worker is a second entrypoint of `api`, draining a Postgres `SKIP LOCKED` queue).

## How to run

Requires **Node 24**. The quickest path is the guided setup — it asks whether to
use Docker or your own Postgres, generates `.env` (secrets included), migrates,
optionally seeds, and can start the app:

```bash
npm run setup
```

<details>
<summary>Prefer to do it manually?</summary>

Requires **Docker** (for PostgreSQL). From a clean clone:

```bash
# 1. Configure — copy the template and set a demo password
cp .env.example .env
#    Edit .env and set SEED_PASSWORD to a password of your choice.
#    It becomes the login for the demo accounts the seed creates (no default).

# 2. Start PostgreSQL
docker compose up -d db

# 3. Install, create the schema, and seed
npm ci
npm run migrate      # applies db/migrations/*.sql
npm run seed         # crawls the seed sites + generates ≥50k rank snapshots (a few minutes)

# 4. Run everything (API :4000 · worker · web :5173)
npm run dev
```

</details>

**Demo accounts** — created by the seed; the password is the `SEED_PASSWORD` you set in `.env`:

| Email | Client |
|---|---|
| `demo@semrush.com` | Semrush (https://www.semrush.com) |
| `demo@yoast.com` | Yoast (https://yoast.com) |

Validate the whole suite (lint + typecheck + tests) with `npm run check`.

## Documentation

| Document | What it covers |
|---|---|
| [docs/project_description.md](docs/project_description.md) | The original brief (requirements, constraints). |
| [docs/implementation-plan.md](docs/implementation-plan.md) | Architecture, monorepo layout, endpoints, phasing, verification. |
| [docs/decisions.md](docs/decisions.md) | Decision log — every choice and the reasoning, terse. |
| [docs/database.md](docs/database.md) | Schema: ER diagram, DDL, the hot queries, modeling notes. |
| [docs/design.md](docs/design.md) | Design language + the theme-token system (ProductiveShop-aligned). |
| [docs/heuristics.md](docs/heuristics.md) | Keyword (RAKE + zone-weighting) and SEO-issue heuristics + sources. |
| [docs/scaling.md](docs/scaling.md) | Production evolution path per area (deliberately not built now). |
| [CLAUDE.md](CLAUDE.md) | Guardrails and architecture guide for AI/dev agents in this repo. |

## Decisions, at a glance

Raw SQL (no ORM) to showcase schema + performance · single repo, two workspaces · worker + Postgres `SKIP LOCKED` queue for crawling · JWT-in-httpOnly-cookie auth · timezone fixed to America/Toronto (per the brief) · SEO thresholds aligned to Lighthouse/Yoast · console UI on a brand-aligned theme-token system. Every choice is sized to the challenge; the scale path for each is in [`docs/scaling.md`](docs/scaling.md). Full rationale in [`docs/decisions.md`](docs/decisions.md).

## AI tools

Built with **Claude Code** (Claude Opus) — used for architecture and planning, the documentation, and (incoming) implementation. Commits carry a `Co-Authored-By` trailer for transparency.

## Git workflow

`main` (release) · `develop` (work in progress) · `feature/*` branches merged into `develop`, with small incremental commits.

**Final release:** before submitting, merge `develop → main` (`--no-ff`) so `main` holds the complete, runnable app — `main` is the branch a reviewer sees by default. Until then `main` intentionally stays at the baseline and sits "behind" `develop`.
