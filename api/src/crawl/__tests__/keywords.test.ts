import { describe, it, expect } from 'vitest';
import { extractKeywords } from '../keywords';
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

describe('extractKeywords', () => {
  it('surfaces title/h1 phrases and excludes stopwords, normalized to the top', () => {
    const kws = extractKeywords(
      makeContent({
        title: 'Keyword Research Tools',
        h1: ['Keyword Research'],
        bodyText:
          'This is a guide. Keyword research is useful, and the tools are great for research.',
      }),
    );
    const texts = kws.map((k) => k.text);
    expect(texts).toContain('keyword research');
    expect(texts).not.toContain('the');
    expect(texts).not.toContain('is');
    expect(kws[0]?.relevance).toBe(1); // top candidate normalized to 1
    expect(kws.every((k) => k.relevance > 0 && k.relevance <= 1)).toBe(true);
  });

  it('weights the title above the body (a title term beats a single body mention)', () => {
    const kws = extractKeywords(
      makeContent({ title: 'xylophone', bodyText: 'zephyr clouds drift slowly' }),
    );
    const texts = kws.map((k) => k.text);
    expect(texts).toContain('xylophone'); // title zone weight 5
    expect(texts).not.toContain('zephyr'); // lone body mention falls below minScore
  });

  it('caps keyphrase length, dropping long run-on phrases', () => {
    const kws = extractKeywords(
      makeContent({ title: 'alpha beta gamma. one two three four five six seven' }),
    );
    const texts = kws.map((k) => k.text);
    expect(texts).toContain('alpha beta gamma'); // 3 words, kept
    expect(texts.every((t) => t.split(' ').length <= 4)).toBe(true); // nothing longer
  });

  it('caps the result at topN', () => {
    const words = Array.from({ length: 12 }, (_, i) => `termword${String.fromCharCode(97 + i)}`);
    const kws = extractKeywords(makeContent({ title: words.join(' and ') }), { topN: 5 });
    expect(kws).toHaveLength(5);
  });
});
