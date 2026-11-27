import { describe, it, expect } from 'vitest';
import { withFixtureFallback } from '../fixtures';

describe('withFixtureFallback', () => {
  it('prefers live content when the fetch succeeds', async () => {
    const fetchText = withFixtureFallback(async () => 'LIVE');
    expect(await fetchText('https://www.semrush.com/robots.txt')).toBe('LIVE');
  });

  it('falls back to the committed fixture when live returns null', async () => {
    const fetchText = withFixtureFallback(async () => null);
    const content = await fetchText('https://www.semrush.com/robots.txt');
    expect(content).not.toBeNull();
    expect(content).toContain('Sitemap'); // the real robots.txt declares sitemaps
  });

  it('returns null when neither live nor fixture has the URL', async () => {
    const fetchText = withFixtureFallback(async () => null);
    expect(await fetchText('https://nope.example/missing')).toBeNull();
  });
});
