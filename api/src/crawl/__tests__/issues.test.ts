import { describe, it, expect } from 'vitest';
import { detectIssues } from '../issues';
import type { PageContent } from '../fetchPage';

function makeContent(p: Partial<PageContent>): PageContent {
  return {
    url: 'https://x.com/post',
    slug: '',
    title: '',
    hasTitle: false,
    metaDescription: null,
    robots: null,
    canonical: null,
    viewport: null,
    h1: [],
    headings: [],
    bodyText: '',
    wordCount: 0,
    images: { total: 0, missingAlt: 0 },
    links: [],
    ...p,
  };
}

const codes = (c: PageContent) => detectIssues(c).map((i) => i.code);

// A page that passes every check — reused with overrides below.
const healthy = (): Partial<PageContent> => ({
  title: 'x'.repeat(45), // 30..60
  hasTitle: true,
  h1: ['One clear heading'],
  metaDescription: 'x'.repeat(130), // 120..160
  canonical: 'https://x.com/p',
  viewport: 'width=device-width',
  robots: 'index, follow',
  wordCount: 500,
  images: { total: 2, missingAlt: 0 },
  links: [{ text: 'read our full guide', href: '/g' }],
});

describe('detectIssues', () => {
  it('flags a bare page', () => {
    const cds = codes(makeContent({}));
    expect(cds).toEqual(
      expect.arrayContaining([
        'TITLE_MISSING',
        'H1_MISSING',
        'META_DESC_MISSING',
        'THIN_CONTENT',
        'CANONICAL_MISSING',
        'VIEWPORT_MISSING',
      ]),
    );
  });

  it('a well-formed page has no issues', () => {
    expect(detectIssues(makeContent(healthy()))).toEqual([]);
  });

  it('title length thresholds', () => {
    expect(codes(makeContent({ ...healthy(), title: 'short' }))).toContain('TITLE_TOO_SHORT');
    expect(codes(makeContent({ ...healthy(), title: 'x'.repeat(70) }))).toContain('TITLE_TOO_LONG');
  });

  it('meta description length thresholds', () => {
    expect(codes(makeContent({ ...healthy(), metaDescription: 'x'.repeat(50) }))).toContain(
      'META_DESC_TOO_SHORT',
    );
    expect(codes(makeContent({ ...healthy(), metaDescription: 'x'.repeat(200) }))).toContain(
      'META_DESC_TOO_LONG',
    );
  });

  it('noindex, multiple h1, missing alt and non-descriptive links', () => {
    const cds = codes(
      makeContent({
        ...healthy(),
        h1: ['one', 'two'],
        robots: 'noindex, follow',
        images: { total: 3, missingAlt: 2 },
        links: [{ text: 'click here', href: '/a' }],
      }),
    );
    expect(cds).toEqual(
      expect.arrayContaining(['NOINDEX', 'H1_MULTIPLE', 'IMG_MISSING_ALT', 'NON_DESCRIPTIVE_LINKS']),
    );
  });
});
