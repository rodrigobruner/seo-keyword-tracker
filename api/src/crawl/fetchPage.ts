import * as cheerio from 'cheerio';
import type { FetchText } from './sitemap';

// Fetches a page and parses it into the structured zones the keyword and issue
// heuristics consume. `parsePage` (pure, HTML in → PageContent out) is split
// from `fetchPage` (I/O) so it's unit-testable with HTML fixtures.

export interface PageLink {
  text: string;
  href: string;
}

export interface PageContent {
  url: string;
  slug: string;
  title: string;
  hasTitle: boolean;
  metaDescription: string | null;
  robots: string | null;
  canonical: string | null;
  viewport: string | null;
  h1: string[];
  headings: string[]; // h2 + h3
  bodyText: string;
  wordCount: number;
  images: { total: number; missingAlt: number };
  links: PageLink[];
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function slugWords(url: string): string {
  try {
    const path = new URL(url).pathname;
    return decodeURIComponent(path).replace(/[-_/]+/g, ' ').trim();
  } catch {
    return '';
  }
}

export function parsePage(html: string, url: string): PageContent {
  const $ = cheerio.load(html);

  const title = collapse($('title').first().text());
  const metaDescription = $('meta[name="description"]').attr('content')?.trim() || null;
  const robots = $('meta[name="robots"]').attr('content')?.trim().toLowerCase() || null;
  const canonical = $('link[rel="canonical"]').attr('href')?.trim() || null;
  const viewport = $('meta[name="viewport"]').attr('content')?.trim() || null;

  const h1 = $('h1')
    .map((_, el) => collapse($(el).text()))
    .get()
    .filter(Boolean);
  const headings = $('h2, h3')
    .map((_, el) => collapse($(el).text()))
    .get()
    .filter(Boolean);

  const images = $('img');
  let missingAlt = 0;
  images.each((_, el) => {
    if ($(el).attr('alt') === undefined) missingAlt += 1;
  });

  const links: PageLink[] = $('a[href]')
    .map((_, el) => ({ text: collapse($(el).text()), href: $(el).attr('href') ?? '' }))
    .get()
    .filter((l) => l.href);

  // Body text for word count + the keyword body zone. Prefer the main content
  // container and strip boilerplate (nav/header/footer/…) so keywords reflect the
  // article, not the site chrome. Appending a space to each element prevents
  // adjacent element text from gluing together (e.g. "FactsAffiliate program").
  const article = $('article').first();
  const main = $('main').first();
  const $content = (article.length ? article : main.length ? main : $('body')).clone();
  $content.find('script, style, noscript, template, nav, header, footer, aside, form').remove();
  $content.find('*').each((_, el) => {
    $(el).append(' ');
  });
  const bodyText = collapse($content.text());
  const wordCount = bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0;

  return {
    url,
    slug: slugWords(url),
    title,
    hasTitle: title.length > 0,
    metaDescription,
    robots,
    canonical,
    viewport,
    h1,
    headings,
    bodyText,
    wordCount,
    images: { total: images.length, missingAlt },
    links,
  };
}

/** Fetch + parse a page. Returns null if the page can't be fetched. */
export async function fetchPage(url: string, fetchText: FetchText): Promise<PageContent | null> {
  const html = await fetchText(url);
  if (html == null) return null;
  return parsePage(html, url);
}
