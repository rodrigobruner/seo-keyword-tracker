-- 0001_init — initial schema.
-- Domain: users, clients, pages, keywords, page_keywords, seo_issues, rank_snapshots.
-- Plus crawl_jobs (infrastructure queue, claimed via SELECT ... FOR UPDATE SKIP LOCKED).
-- See docs/database.md for the rationale.

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
  pages_total  int,                                   -- crawl progress (for "7/15" UX)
  pages_done   int    NOT NULL DEFAULT 0,
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

CREATE TABLE page_keywords (                           -- M:N "page likely ranks for keyword"
  page_id    bigint NOT NULL REFERENCES pages(id)    ON DELETE CASCADE,
  keyword_id bigint NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  relevance  real   NOT NULL,                          -- heuristic score
  PRIMARY KEY (page_id, keyword_id)
);

CREATE TABLE seo_issues (
  id         bigserial PRIMARY KEY,
  page_id    bigint NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  code       text   NOT NULL,                          -- e.g. TITLE_TOO_LONG
  severity   text   NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH')),
  message    text   NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rank_snapshots (
  page_id     bigint      NOT NULL REFERENCES pages(id)    ON DELETE CASCADE,
  keyword_id  bigint      NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  captured_at timestamptz NOT NULL,                     -- UTC instant
  position    smallint    NOT NULL CHECK (position BETWEEN 1 AND 100),
  PRIMARY KEY (page_id, keyword_id, captured_at)        -- identity + 1/day + hot query
);

-- Processing queue (infrastructure, NOT a domain entity).
CREATE TABLE crawl_jobs (
  id           bigserial PRIMARY KEY,
  client_id    bigint NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status       text   NOT NULL DEFAULT 'QUEUED'
                 CHECK (status IN ('QUEUED','RUNNING','DONE','FAILED')),
  attempts     int    NOT NULL DEFAULT 0,
  max_attempts int    NOT NULL DEFAULT 3,
  last_error   text,
  run_after    timestamptz NOT NULL DEFAULT now(),     -- retry backoff / delayed start
  locked_at    timestamptz,                            -- when a worker claimed it
  locked_by    text,                                   -- worker id, for observability
  started_at   timestamptz,
  finished_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_pages_client     ON pages (client_id);
CREATE INDEX idx_issues_page      ON seo_issues (page_id);
CREATE INDEX idx_pagekw_keyword   ON page_keywords (keyword_id);              -- search by keyword
CREATE INDEX idx_crawl_jobs_claim ON crawl_jobs (run_after) WHERE status = 'QUEUED';
