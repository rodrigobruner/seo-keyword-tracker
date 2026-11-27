import { discoverBlogPostUrls, NoSitemapError, type FetchText } from './sitemap';
import { fetchPage as defaultFetchPage } from './fetchPage';
import { extractKeywords } from './keywords';
import { detectIssues } from './issues';
import type { CrawlRepository } from '../repositories/crawl-repository';

// Orchestrates a single client crawl: discover the blog sitemap, fetch the first
// N posts, derive keywords + issues, and persist. Best-effort per page (a failed
// fetch is skipped). Marks the client READY if anything was crawled, FAILED if
// discovery fails or nothing could be fetched. Creates NO rank snapshots (the
// seed does). Dependencies are injected so it's unit-testable without network/DB.
//
// Failure reporting: the client ALWAYS reaches a terminal state (never stuck in
// CRAWLING) with a clear, user-facing reason — even on an unexpected mid-crawl
// error, which also re-throws so the worker records/retries the job. Messages are
// written for the end user (no raw error strings leak to the UI).

export interface CrawlClientDeps {
  fetchText: FetchText;
  repo: CrawlRepository;
  maxPages?: number;
  discover?: typeof discoverBlogPostUrls;
  fetchPage?: typeof defaultFetchPage;
}

export interface CrawlResult {
  status: 'READY' | 'FAILED';
  pagesCrawled: number;
  error?: string;
}

/** User-facing crawl-failure reasons (shown on the Add-client screen). */
export const CRAWL_MESSAGES = {
  noSitemap:
    "We couldn't find a blog sitemap for this site. We checked robots.txt, a homepage sitemap link, and common paths, but none pointed to a blog.",
  discoveryFailed: 'Sitemap discovery failed unexpectedly. Please try again.',
  allBlocked: (found: number): string =>
    `The site returned no crawlable pages (${found} found, all blocked or unreachable). It may restrict automated access.`,
  unexpected: 'The crawl failed unexpectedly. Please try again.',
} as const;

const DEFAULT_MAX_PAGES = 15;

/** markFailed that never masks an in-flight error we're about to re-throw. */
async function markFailedSafe(repo: CrawlRepository, clientId: number, msg: string): Promise<void> {
  try {
    await repo.markFailed(clientId, msg);
  } catch {
    /* keep the original error for the worker to log/retry */
  }
}

export async function crawlClient(
  clientId: number,
  websiteUrl: string,
  deps: CrawlClientDeps,
): Promise<CrawlResult> {
  const { fetchText, repo } = deps;
  const discover = deps.discover ?? discoverBlogPostUrls;
  const fetchPage = deps.fetchPage ?? defaultFetchPage;
  const maxPages = deps.maxPages ?? DEFAULT_MAX_PAGES;

  await repo.markCrawling(clientId);

  let urls: string[];
  try {
    urls = await discover(websiteUrl, { fetchText, maxPosts: maxPages });
  } catch (err) {
    const isNoSitemap = err instanceof NoSitemapError;
    if (!isNoSitemap && process.env.CRAWL_DEBUG) console.error('[crawl] discovery', err);
    const msg = isNoSitemap ? CRAWL_MESSAGES.noSitemap : CRAWL_MESSAGES.discoveryFailed;
    await repo.markFailed(clientId, msg);
    return { status: 'FAILED', pagesCrawled: 0, error: msg };
  }

  await repo.setPagesTotal(clientId, urls.length);

  let crawled = 0;
  try {
    for (const url of urls) {
      const page = await fetchPage(url, fetchText);
      if (!page) continue; // best-effort: skip pages that can't be fetched
      const keywords = extractKeywords(page);
      const issues = detectIssues(page);
      await repo.savePage(clientId, page, keywords, issues);
      crawled += 1;
    }
  } catch (err) {
    // Unexpected mid-crawl error (e.g. a DB write failing): guarantee a terminal
    // client state so the UI never hangs on CRAWLING, then re-throw so the worker
    // records the error and retries the job.
    await markFailedSafe(repo, clientId, CRAWL_MESSAGES.unexpected);
    throw err;
  }

  if (crawled === 0) {
    // Discovery found URLs but none could be fetched — most likely the site
    // blocked our crawler (403/anti-bot) or every page timed out.
    const msg = CRAWL_MESSAGES.allBlocked(urls.length);
    await repo.markFailed(clientId, msg);
    return { status: 'FAILED', pagesCrawled: 0, error: msg };
  }

  await repo.markReady(clientId);
  return { status: 'READY', pagesCrawled: crawled };
}
