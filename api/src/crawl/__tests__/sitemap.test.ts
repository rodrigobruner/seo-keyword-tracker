import { describe, it, expect } from 'vitest';
import {
  discoverBlogPostUrls,
  scoreSitemapLoc,
  NoSitemapError,
  type FetchText,
} from '../sitemap';

const NS = 'http://www.sitemaps.org/schemas/sitemap/0.9';

const indexXml = (locs: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="${NS}">` +
  locs.map((l) => `<sitemap><loc>${l}</loc></sitemap>`).join('') +
  `</sitemapindex>`;

const urlsetXml = (locs: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="${NS}">` +
  locs.map((l) => `<url><loc>${l}</loc></url>`).join('') +
  `</urlset>`;

/** fetchText fake backed by a URL→content map; unknown URLs resolve to null. */
function fakeFetch(map: Record<string, string>): FetchText {
  return async (url: string) => (url in map ? map[url] : null);
}

describe('discoverBlogPostUrls', () => {
  it('yoast-like: picks post-sitemap, ignoring tag/page/product traps', async () => {
    const posts = [
      'https://yoast.com/seo-basics/',
      'https://yoast.com/link-building/',
      'https://yoast.com/meta-tags/',
    ];
    const fetchText = fakeFetch({
      'https://yoast.com/robots.txt': 'Sitemap: https://yoast.com/sitemap_index.xml',
      'https://yoast.com/sitemap_index.xml': indexXml([
        'https://yoast.com/post-sitemap.xml',
        'https://yoast.com/post_tag-sitemap.xml',
        'https://yoast.com/page-sitemap.xml',
        'https://yoast.com/product-sitemap.xml',
      ]),
      'https://yoast.com/post-sitemap.xml': urlsetXml(posts),
    });

    const result = await discoverBlogPostUrls('https://yoast.com', { fetchText });
    expect(result).toEqual(posts);
  });

  it('semrush-like: prefers the input host and recurses nested indexes (English, not localized)', async () => {
    const enPosts = ['https://www.semrush.com/blog/a/', 'https://www.semrush.com/blog/b/'];
    const dePosts = ['https://de.semrush.com/blog/a/', 'https://de.semrush.com/blog/b/'];
    const fetchText = fakeFetch({
      'https://www.semrush.com/robots.txt':
        'Sitemap: https://www.semrush.com/sitemap.xml\n' +
        'Sitemap: https://de.semrush.com/blog/sitemap/\n' +
        'Sitemap: https://es.semrush.com/blog/sitemap/',
      'https://www.semrush.com/sitemap.xml': indexXml([
        'https://www.semrush.com/blog/sitemap/',
        'https://de.semrush.com/blog/sitemap/',
      ]),
      // nested index on the English blog
      'https://www.semrush.com/blog/sitemap/': indexXml([
        'https://www.semrush.com/blog/sitemap-1.xml',
      ]),
      'https://www.semrush.com/blog/sitemap-1.xml': urlsetXml(enPosts),
      'https://de.semrush.com/blog/sitemap/': urlsetXml(dePosts),
    });

    const result = await discoverBlogPostUrls('https://www.semrush.com', { fetchText });
    expect(result).toEqual(enPosts);
  });

  it('takes the first N posts in document order', async () => {
    const all = Array.from({ length: 20 }, (_, i) => `https://x.com/post-${i}/`);
    const fetchText = fakeFetch({
      'https://x.com/robots.txt': 'Sitemap: https://x.com/posts.xml',
      'https://x.com/posts.xml': urlsetXml(all),
    });

    const result = await discoverBlogPostUrls('https://x.com', { fetchText, maxPosts: 15 });
    expect(result).toHaveLength(15);
    expect(result).toEqual(all.slice(0, 15));
  });

  it('falls back to common sitemap paths when robots.txt has none', async () => {
    const posts = ['https://y.com/one/', 'https://y.com/two/'];
    const fetchText = fakeFetch({
      // no robots.txt entry → fallback probes /sitemap.xml
      'https://y.com/sitemap.xml': urlsetXml(posts),
    });

    const result = await discoverBlogPostUrls('https://y.com', { fetchText });
    expect(result).toEqual(posts);
  });

  it('throws NoSitemapError when nothing is found', async () => {
    const fetchText = fakeFetch({});
    await expect(discoverBlogPostUrls('https://nope.com', { fetchText })).rejects.toBeInstanceOf(
      NoSitemapError,
    );
  });

  it('rejects non-http(s) URLs', async () => {
    const fetchText = fakeFetch({});
    await expect(discoverBlogPostUrls('ftp://x.com', { fetchText })).rejects.toThrow();
  });
});

describe('scoreSitemapLoc', () => {
  it('ranks post-sitemap above the tag trap', () => {
    const post = scoreSitemapLoc('https://yoast.com/post-sitemap.xml', 'yoast.com');
    const tag = scoreSitemapLoc('https://yoast.com/post_tag-sitemap.xml', 'yoast.com');
    expect(post).toBeGreaterThan(tag);
  });

  it('ranks the same-host index above a cross-host blog sitemap', () => {
    const sameHost = scoreSitemapLoc('https://www.semrush.com/sitemap.xml', 'www.semrush.com');
    const crossHostBlog = scoreSitemapLoc('https://de.semrush.com/blog/sitemap/', 'www.semrush.com');
    expect(sameHost).toBeGreaterThan(crossHostBlog);
  });
});
