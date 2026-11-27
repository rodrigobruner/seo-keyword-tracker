# SEO heuristics — keywords & issues

A page's keywords and SEO issues are derived **from the page itself** with documented heuristics — nothing queries Google, and there's no answer key. All weights and thresholds live in a config module (no magic numbers in the logic), so they're easy to tune. The logic is isolated in `api/src/crawl/keywords.ts` and `api/src/crawl/issues.ts` as pure functions (fully unit-testable).

## How we got here (market research changed the approach)

The first plan was naive: extract fixed uni-/bigrams weighted by where they appear, and a hand-picked issue list with ad-hoc thresholds. Before committing, we studied how established tools do this — and **changed the approach** as a result. This is a deliberate shift worth recording:

- **Issue checks & thresholds → aligned to Google Lighthouse and Yoast** instead of invented numbers. Yoast is especially relevant: it's GPL open source *and* one of our seed sites. Concretely, the meta-description floor moved from `< 50` to `< 120` chars (Yoast/Lighthouse consensus), and we added Lighthouse-grounded checks (`NOINDEX`, `NON_DESCRIPTIVE_LINKS`) and a Yoast-grounded one (`KEYWORD_STUFFING`).
- **Keyword extraction → RAKE-style candidate phrases** instead of fixed n-grams. RAKE (Rapid Automatic Keyword Extraction) builds candidate phrases by splitting on stopwords/punctuation and scores words by co-occurrence — proven, simple, single-document. We keep our **SEO zone-weighting** on top (title/h1 are strong ranking signals that generic extractors like RAKE/YAKE/TextRank ignore), and optionally layer **TF-IDF** across the 15 crawled pages to suppress site-wide boilerplate.

**Why the change:** industry-aligned thresholds are more defensible than numbers we made up, and reusing strategies that already work is cheaper and more credible than reinventing on a topic that isn't our specialty. We still implement a small RAKE in-house (a few lines) to keep dependencies minimal and the logic visible/testable.

## Keyword extraction (`crawl/keywords.ts`)

**Zones & weights** (where a term appears matters — an SEO-specific signal):

| Zone | Weight |
|---|---|
| `<title>` | 5 |
| `<h1>` | 4 |
| meta description | 3 |
| `<h2>` / `<h3>` | 2 |
| URL slug | 2 |
| body paragraphs | 1 |

**Pipeline:**
1. Normalize (lowercase, strip punctuation/entities, collapse whitespace).
2. **RAKE candidates:** split each zone's text on stopwords (English list) and punctuation → candidate phrases; drop tokens `< 3` chars and number-only tokens.
3. **Score** = Σ over zones of `zone_weight × RAKE_phrase_score` (RAKE word score = `degree / frequency`, summed per phrase).
4. *(Optional, time-permitting)* multiply by **IDF** computed across the 15 crawled pages — downranks terms common to the whole site. This is the only step that couples pages (two-phase pass), so it's opt-in.
5. Keep candidates with **score ≥ 2** (a lone body mention doesn't qualify); take the **top 15** (the page-detail view shows the first 8 with a "show all"); store `relevance = score / top_score` (normalized **0..1**).

**Scope:** English (English stopword list). Other languages would need their own stopwords — out of scope, documented.

## SEO issues (`crawl/issues.ts`)

Each issue is `{ code, severity, message }`. Thresholds in config.

| Code | Rule (threshold) | Severity | Source |
|---|---|---|---|
| `TITLE_MISSING` | no `<title>` or empty | HIGH | Lighthouse |
| `TITLE_TOO_SHORT` | title `< 30` chars | MEDIUM | Lighthouse/Yoast (ideal 50–60) |
| `TITLE_TOO_LONG` | title `> 60` chars | MEDIUM | Lighthouse/Yoast |
| `H1_MISSING` | no `<h1>` | HIGH | Lighthouse (heading hierarchy) |
| `H1_MULTIPLE` | more than one `<h1>` | LOW | Lighthouse |
| `META_DESC_MISSING` | no meta description | MEDIUM | Lighthouse |
| `META_DESC_TOO_SHORT` | `< 120` chars | LOW | Yoast (120) / Lighthouse (120–160) |
| `META_DESC_TOO_LONG` | `> 160` chars | LOW | Lighthouse/Yoast (~156–160) |
| `IMG_MISSING_ALT` | ≥ 1 `<img>` without `alt` (message carries the count) | MEDIUM | Lighthouse |
| `THIN_CONTENT` | body `< 300` words | MEDIUM | common SEO guidance |
| `CANONICAL_MISSING` | no `<link rel="canonical">` | LOW | Lighthouse |
| `VIEWPORT_MISSING` | no `<meta name="viewport">` | LOW | Lighthouse (mobile) |
| `NOINDEX` | `<meta name="robots">` / `X-Robots-Tag` contains `noindex` | HIGH | Lighthouse (crawlability) |
| `NON_DESCRIPTIVE_LINKS` | anchor text in a blocklist ("click here", "read more", "here", "link") | LOW | Lighthouse |
| `KEYWORD_STUFFING` *(optional)* | top keyword density `> 3%` | LOW | Yoast (green 0.5–3%) |

**Severity logic:** HIGH = hurts indexing/ranking strongly (missing title/H1, `noindex`); MEDIUM = notable on-page (title length, missing meta, image alt, thin content); LOW = refinements (meta length, multiple H1, canonical, viewport, link text).

**`word_count`** = words in the visible `<body>` text (after removing `<script>`/`<style>`), stored in `pages.word_count`. Feeds `THIN_CONTENT` and is shown on the page detail.

## Complexity & scope

- **Issue checks:** three new ones are small predicates; negligible cost; no impact on schema/API/worker.
- **Keyword core (RAKE + zones):** ~a self-contained module; the only new concept is RAKE's co-occurrence degree. Per-page, pure, easily tested.
- **TF-IDF:** the only real complexity — a two-phase corpus pass that couples the 15 pages. Kept optional/opt-in for that reason.
- Everything lives in two pure modules (`crawl/keywords.ts`, `crawl/issues.ts`) driven by config — zero reach into DB/auth/worker/API.

## References

- **Google Lighthouse — SEO audits** (issue checks & structure): https://lighthouse-md.com/audits — adopted the checklist (title, meta, alt, heading hierarchy, `noindex`/crawlability, descriptive link text).
- **Yoast SEO — scoring (GPL, GitHub)**: https://github.com/Yoast/wordpress-seo/blob/trunk/packages/yoastseo/src/scoring/assessments/SCORING%20SEO.md — thresholds for title/meta length and keyphrase density. Also a seed site.
- **Yoast — meta description length**: https://yoast.com/meta-descriptions/ — `< 120` short / `> 156–160` long.
- **RAKE / TextRank / TF-IDF overview**: https://www.tiernok.com/posts/automated-keyword-extraction-tf-idf-rake-and-textrank.html — keyword-extraction strategy.
