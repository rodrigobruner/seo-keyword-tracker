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

const DEFAULT_MAX_PAGES = 15;

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
    const msg =
      err instanceof NoSitemapError ? err.message : `Sitemap discovery failed: ${String(err)}`;
    await repo.markFailed(clientId, msg);
    return { status: 'FAILED', pagesCrawled: 0, error: msg };
  }

  await repo.setPagesTotal(clientId, urls.length);

  let crawled = 0;
  for (const url of urls) {
    const page = await fetchPage(url, fetchText);
    if (!page) continue; // best-effort: skip pages that can't be fetched
    const keywords = extractKeywords(page);
    const issues = detectIssues(page);
    await repo.savePage(clientId, page, keywords, issues);
    crawled += 1;
  }

  if (crawled === 0) {
    const msg = 'No pages could be crawled';
    await repo.markFailed(clientId, msg);
    return { status: 'FAILED', pagesCrawled: 0, error: msg };
  }

  await repo.markReady(clientId);
  return { status: 'READY', pagesCrawled: crawled };
}
