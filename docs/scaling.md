# Scaling & evolution

What would change if this grew into a real product — real SERP volume, multi-tenant teams, many engineers. **Only the differences from today's design are listed; anything not mentioned stays as in `decisions.md` / `database.md`.** None of this is built now — the simplicity is a choice. A few items may be pulled forward during development if time allows.

Format per area: **Trigger** (what forces the change) → **Change**.

---

## Data model

**IDs** — Exposed on public/shared URLs → add opaque external ids (UUID/ULID) at the API boundary (`bigint` stays internal), stopping enumeration and business-volume leakage.

**`rank_snapshots`** — Tens of millions+ of rows → range-partition by time (monthly) or move to a time-series store (TimescaleDB/ClickHouse); add rollups (daily→weekly/monthly) + retention; replace the computed latest-position with a maintained `rank_latest` table/matview updated on write.

**Timezone** — Users outside Toronto → make the display timezone a per-user preference instead of a fixed America/Toronto.

**`seo_issues`** — Need to filter/aggregate by type, tune severity centrally, or translate messages → promote to a catalog (`issue_type`: code, default severity, remediation, i18n message) + instances referencing it.

**`position`** — Real SERP data → allow `>100` / `NULL` ("not ranking") and add dimensions (location, device, search engine, SERP features), splitting the snapshot grain.

**Deletes** — Recovery/audit/compliance matter → soft-delete (`deleted_at`) + audit trail (`created_by`, `updated_at`, history) instead of hard cascades.

## Tenancy

Agency is a team sharing clients → orgs/teams with membership + RBAC; consider Postgres RLS for hard per-tenant isolation; read replicas + caching on the read paths.

## Authentication

Sessions must be revocable, or need reset/verification/compliance → refresh tokens with rotation + a revocation/session store; password reset + email verification; MFA; login rate-limit + lockout.

## Crawl pipeline

Already durable + horizontally scalable (Postgres `crawl_jobs` + `SKIP LOCKED` workers; add worker containers for throughput). The remaining lever: broker-grade features → move to a dedicated broker (SQS/BullMQ/Temporal) for priorities, delayed jobs, dead-letter queues, and cross-service fan-out; add per-host rate-limiting + robots-`crawl-delay` compliance and scheduled re-crawls.

## Keyword & issue logic

On-page heuristics aren't accurate enough → real SERP/keyword data + ML ranking; issue checks backed by a rules engine and real audits (Lighthouse/crawl diagnostics).

## Data access

Hand-written SQL becomes a team maintainability cost → adopt a typed query builder (Kysely) — still SQL-first, no full ORM.

## Security

The take-home already covers the OWASP basics (see `decisions.md` → "Security posture"). Beyond the items already noted under **Authentication** (refresh/rotation/revocation, MFA, reset/verification, lockout) and **Tenancy** (Postgres RLS):
- Real users/compliance → immutable **audit log** of security-relevant actions (login, client create, cross-tenant attempts).
- Production secrets → a managed **secret store** with rotation instead of a single `SESSION_SECRET` in `.env`.
- Hardening pipeline → automated **dependency scanning + SAST/DAST** in CI, and a **WAF / managed rate-limiting** at the edge.
- Frontend on a different origin than the API → explicit **CSRF tokens** (double-submit); today SameSite=Lax + same-origin suffices.
