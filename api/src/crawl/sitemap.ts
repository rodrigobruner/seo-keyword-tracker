import { XMLParser } from 'fast-xml-parser';

// Generic blog-sitemap discovery. From a bare website URL it finds the blog/post
// sitemap and returns the first N post URLs — with nothing hardcoded about any
// specific site. Strategy:
//   1. Find seed sitemaps, in order of authority:
//        a. robots.txt `Sitemap:` lines (the only spec'd discovery mechanism),
//        b. else the homepage's `<link rel="sitemap">` (a weak but site-declared
//           convention, better than guessing),
//        c. else probe common paths (/sitemap.xml, /wp-sitemap.xml, *.gz, .txt …).
//   2. walk sitemap indexes, scoring children for "blog-ness" and preferring the
//      input host (so localized subdomains don't win),
//   3. recurse until a <urlset> of posts is reached; take the first N in order.
//
// Sitemaps may be XML (urlset/index), gzip (.xml.gz — the HTTP layer gunzips),
// or the plain-text format (one URL per line). HTTP (with SSRF guards) is
// injected as `fetchText`, so this logic is pure and fully unit-testable.

export type FetchText = (url: string) => Promise<string | null>;

export interface DiscoverOptions {
  fetchText: FetchText;
  /** Max post URLs to return (the brief asks for the first 15). */
  maxPosts?: number;
  /** Recursion cap for nested sitemap indexes. */
  maxDepth?: number;
  /** Total sitemaps fetched cap (DoS guard against huge/looping indexes). */
  maxSitemaps?: number;
}

export class NoSitemapError extends Error {
  constructor(websiteUrl: string) {
    super(`No blog sitemap found for ${websiteUrl}`);
    this.name = 'NoSitemapError';
  }
}

const DEFAULT_MAX_POSTS = 15;
const DEFAULT_MAX_DEPTH = 4;
const DEFAULT_MAX_SITEMAPS = 25;

const parser = new XMLParser({ ignoreAttributes: true, trimValues: true });

const NEGATIVE_MARKERS = ['tag', 'category', 'categories', 'author', 'product', 'page-sitemap'];

// Probed only when robots.txt and the homepage declare nothing. There is no
// standard sitemap filename (sitemaps.org leaves location open) — these are the
// highest-probability conventions, ordered by likelihood:
//   /sitemap.xml          de-facto default search engines probe at the root
//   /sitemap_index.xml    Yoast SEO (WordPress) index name
//   /wp-sitemap.xml       WordPress core 5.5+ native sitemap
//   *.gz                  gzipped variants (allowed by the protocol)
//   /sitemap.txt          the protocol's plain-text format
//
// These probes are ROOT-ONLY by design. Per sitemaps.org a sitemap may live at a
// non-root path (e.g. /catalog/sitemap.xml), but such a sitemap is discoverable
// only when *declared* — via robots.txt, a homepage <link rel="sitemap">, or as
// an index child (all handled above/below). We deliberately do not guess non-root
// paths: it is combinatorial and is precisely what declaration exists to avoid.
// See docs/scaling.md → Crawl pipeline for the boundary + production path.
const FALLBACK_PATHS = [
  '/sitemap.xml',
  '/sitemap_index.xml',
  '/wp-sitemap.xml',
  '/sitemap-index.xml',
  '/sitemap.xml.gz',
  '/sitemap_index.xml.gz',
  '/sitemap.txt',
];

/** Normalize an input URL to its `protocol//host` origin; reject non-http(s). */
export function normalizeOrigin(websiteUrl: string): string {
  let u: URL;
  try {
    u = new URL(websiteUrl.includes('://') ? websiteUrl : `https://${websiteUrl}`);
  } catch {
    throw new Error(`Invalid website URL: ${websiteUrl}`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`Unsupported protocol: ${u.protocol}`);
  }
  return `${u.protocol}//${u.host}`;
}

/** Score a sitemap/loc URL for how likely it leads to blog posts. */
export function scoreSitemapLoc(loc: string, inputHost: string): number {
  let u: URL;
  try {
    u = new URL(loc);
  } catch {
    return -100;
  }
  const path = `${u.pathname}${u.search}`.toLowerCase();
  let score = 0;
  if (u.host === inputHost) score += 5; // dominant: same host beats a cross-host blog
  if (path.includes('/blog')) score += 3;
  if (/post[-_]?sitemap/.test(path) || path.includes('/post-')) score += 3;
  if (path.includes('article') || path.includes('news')) score += 1;
  if (NEGATIVE_MARKERS.some((m) => path.includes(m))) score -= 4;
  return score;
}

function parseRobotsSitemaps(txt: string): string[] {
  return txt
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^sitemap:/i.test(l))
    .map((l) => l.replace(/^sitemap:\s*/i, '').trim())
    .filter(Boolean);
}

function toArray(node: unknown): unknown[] {
  if (Array.isArray(node)) return node;
  if (node == null) return [];
  return [node];
}

function extractLocs(node: unknown): string[] {
  const locs: string[] = [];
  for (const item of toArray(node)) {
    if (item && typeof item === 'object') {
      const loc = (item as Record<string, unknown>).loc;
      if (typeof loc === 'string' && loc.trim()) locs.push(loc.trim());
      else if (typeof loc === 'number') locs.push(String(loc));
    }
  }
  return locs;
}

interface ParsedSitemap {
  kind: 'index' | 'urlset';
  locs: string[];
}

/** URLs in a plain-text sitemap: one absolute http(s) URL per line. */
function parseTextSitemap(content: string): string[] {
  return content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^https?:\/\/\S+$/i.test(l));
}

function parseSitemap(content: string): ParsedSitemap {
  let doc: Record<string, unknown> = {};
  try {
    doc = parser.parse(content) as Record<string, unknown>;
  } catch {
    doc = {};
  }
  if (doc.sitemapindex && typeof doc.sitemapindex === 'object') {
    return { kind: 'index', locs: extractLocs((doc.sitemapindex as Record<string, unknown>).sitemap) };
  }
  if (doc.urlset && typeof doc.urlset === 'object') {
    return { kind: 'urlset', locs: extractLocs((doc.urlset as Record<string, unknown>).url) };
  }
  // Not XML sitemap markup — try the plain-text format (bare URLs, one per line).
  return { kind: 'urlset', locs: parseTextSitemap(content) };
}

/** Extract `<link rel="sitemap" href="…">` targets from homepage HTML. */
export function extractSitemapLinks(html: string, base: string): string[] {
  const out: string[] = [];
  const linkTag = /<link\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkTag.exec(html)) !== null) {
    if (!/\brel\s*=\s*["']?sitemap\b/i.test(m[0])) continue;
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(m[0]);
    if (href?.[1]) {
      try {
        out.push(new URL(href[1], base).toString());
      } catch {
        /* skip malformed href */
      }
    }
  }
  return out;
}

export async function discoverBlogPostUrls(
  websiteUrl: string,
  opts: DiscoverOptions,
): Promise<string[]> {
  const { fetchText } = opts;
  const maxPosts = opts.maxPosts ?? DEFAULT_MAX_POSTS;
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxSitemaps = opts.maxSitemaps ?? DEFAULT_MAX_SITEMAPS;

  const base = normalizeOrigin(websiteUrl);
  const inputHost = new URL(base).host;

  const robots = await fetchText(`${base}/robots.txt`);
  let seeds = robots ? parseRobotsSitemaps(robots) : [];
  if (seeds.length === 0) {
    // robots is silent → try the homepage's declared <link rel="sitemap">
    const home = await fetchText(base);
    if (home) seeds = extractSitemapLinks(home, base);
  }
  if (seeds.length === 0) {
    seeds = FALLBACK_PATHS.map((p) => `${base}${p}`);
  }

  const queue = seeds.map((url) => ({ url, depth: 0, score: scoreSitemapLoc(url, inputHost) }));
  const visited = new Set<string>();
  let fetched = 0;

  while (queue.length > 0 && fetched < maxSitemaps) {
    queue.sort((a, b) => b.score - a.score);
    const next = queue.shift();
    if (!next || visited.has(next.url)) continue;
    visited.add(next.url);

    const xml = await fetchText(next.url);
    fetched++;
    if (!xml) continue;

    const parsed = parseSitemap(xml);
    if (parsed.kind === 'urlset') {
      const posts = parsed.locs.slice(0, maxPosts);
      if (posts.length > 0) return posts;
      continue; // empty urlset → keep searching other branches
    }
    if (next.depth + 1 <= maxDepth) {
      for (const childLoc of parsed.locs) {
        if (!visited.has(childLoc)) {
          queue.push({
            url: childLoc,
            depth: next.depth + 1,
            score: scoreSitemapLoc(childLoc, inputHost),
          });
        }
      }
    }
  }

  throw new NoSitemapError(websiteUrl);
}
