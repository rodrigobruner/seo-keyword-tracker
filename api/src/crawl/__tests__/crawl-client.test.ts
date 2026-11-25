import { describe, it, expect } from 'vitest';
import { crawlClient } from '../crawl-client';
import { NoSitemapError } from '../sitemap';
import type { CrawlRepository } from '../../repositories/crawl-repository';
import type { PageContent } from '../fetchPage';
import type { KeywordScore } from '../keywords';
import type { SeoIssue } from '../issues';

function makeContent(url: string): PageContent {
  return {
    url,
    slug: 'post',
    title: 'A Decent Title About SEO Keyword Research',
    hasTitle: true,
    metaDescription: 'x'.repeat(130),
    robots: null,
    canonical: 'https://x.com/c',
    viewport: 'width=device-width',
    h1: ['SEO Keyword Research'],
    headings: ['Tools'],
    bodyText: 'keyword research tools and techniques for better rankings '.repeat(20),
    wordCount: 400,
    images: { total: 1, missingAlt: 0 },
    links: [],
  };
}

class FakeRepo implements CrawlRepository {
  calls: string[] = [];
  saved: Array<{ url: string; keywords: KeywordScore[]; issues: SeoIssue[] }> = [];
  async markCrawling(): Promise<void> {
    this.calls.push('markCrawling');
  }
  async setPagesTotal(_id: number, total: number): Promise<void> {
    this.calls.push(`setPagesTotal:${total}`);
  }
  async savePage(
    _id: number,
    page: PageContent,
    keywords: KeywordScore[],
    issues: SeoIssue[],
  ): Promise<void> {
    this.calls.push('savePage');
    this.saved.push({ url: page.url, keywords, issues });
  }
  async markReady(): Promise<void> {
    this.calls.push('markReady');
  }
  async markFailed(_id: number, error: string): Promise<void> {
    this.calls.push(`markFailed:${error}`);
  }
}

const fetchText = async () => null; // unused — discover/fetchPage are injected

describe('crawlClient', () => {
  it('discovers, crawls each page, persists and marks READY', async () => {
    const urls = ['https://x.com/a', 'https://x.com/b', 'https://x.com/c'];
    const repo = new FakeRepo();
    const result = await crawlClient(1, 'https://x.com', {
      fetchText,
      repo,
      discover: async () => urls,
      fetchPage: async (url) => makeContent(url),
    });

    expect(result).toEqual({ status: 'READY', pagesCrawled: 3 });
    expect(repo.calls[0]).toBe('markCrawling');
    expect(repo.calls).toContain('setPagesTotal:3');
    expect(repo.saved.map((s) => s.url)).toEqual(urls);
    expect(repo.calls.at(-1)).toBe('markReady');
    // keyword/issue extraction ran on each page
    expect(repo.saved[0]!.keywords.length).toBeGreaterThan(0);
  });

  it('marks FAILED when sitemap discovery fails', async () => {
    const repo = new FakeRepo();
    const result = await crawlClient(1, 'https://x.com', {
      fetchText,
      repo,
      discover: async () => {
        throw new NoSitemapError('https://x.com');
      },
    });
    expect(result.status).toBe('FAILED');
    expect(repo.calls.some((c) => c.startsWith('markFailed'))).toBe(true);
    expect(repo.calls).not.toContain('savePage');
  });

  it('is best-effort per page (skips unfetchable, still READY)', async () => {
    const urls = ['https://x.com/a', 'https://x.com/b', 'https://x.com/c'];
    const repo = new FakeRepo();
    const result = await crawlClient(1, 'https://x.com', {
      fetchText,
      repo,
      discover: async () => urls,
      fetchPage: async (url) => (url.endsWith('/b') ? null : makeContent(url)),
    });
    expect(result).toEqual({ status: 'READY', pagesCrawled: 2 });
    expect(repo.saved.map((s) => s.url)).toEqual(['https://x.com/a', 'https://x.com/c']);
  });

  it('marks FAILED when no page could be fetched', async () => {
    const repo = new FakeRepo();
    const result = await crawlClient(1, 'https://x.com', {
      fetchText,
      repo,
      discover: async () => ['https://x.com/a'],
      fetchPage: async () => null,
    });
    expect(result.status).toBe('FAILED');
    expect(repo.calls.at(-1)).toBe('markFailed:No pages could be crawled');
  });
});
