import { describe, it, expect } from 'vitest';
import { parsePage } from '../fetchPage';

const HTML = `<!doctype html><html><head>
  <title>Best SEO Tools</title>
  <meta name="description" content="A guide to SEO tools.">
  <meta name="robots" content="index, follow">
  <meta name="viewport" content="width=device-width">
  <link rel="canonical" href="https://x.com/seo-tools">
</head><body>
  <h1>SEO Tools</h1>
  <h2>Keyword research</h2>
  <p>Content about keyword research and link building.</p>
  <img src="a.jpg" alt="a diagram">
  <img src="b.jpg">
  <a href="/x">click here</a>
  <a href="/y">read our guide</a>
  <script>var secret = 1;</script>
</body></html>`;

describe('parsePage', () => {
  it('extracts zones, meta, counts and slug', () => {
    const c = parsePage(HTML, 'https://x.com/blog/seo-tools');
    expect(c.title).toBe('Best SEO Tools');
    expect(c.hasTitle).toBe(true);
    expect(c.metaDescription).toBe('A guide to SEO tools.');
    expect(c.robots).toBe('index, follow');
    expect(c.viewport).toBe('width=device-width');
    expect(c.canonical).toBe('https://x.com/seo-tools');
    expect(c.h1).toEqual(['SEO Tools']);
    expect(c.headings).toContain('Keyword research');
    expect(c.images.total).toBe(2);
    expect(c.images.missingAlt).toBe(1);
    expect(c.links.map((l) => l.text)).toContain('click here');
    expect(c.slug).toBe('blog seo tools');
    expect(c.bodyText).not.toContain('secret'); // <script> stripped
    expect(c.wordCount).toBeGreaterThan(5);
  });

  it('reports missing title and h1 as empty', () => {
    const c = parsePage('<html><body><p>hi there</p></body></html>', 'https://x.com/');
    expect(c.hasTitle).toBe(false);
    expect(c.title).toBe('');
    expect(c.h1).toEqual([]);
    expect(c.metaDescription).toBeNull();
  });
});
