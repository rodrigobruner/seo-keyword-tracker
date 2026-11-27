import { describe, it, expect } from 'vitest';
import { buildPageOrderBy } from '../page-repository';

describe('buildPageOrderBy (sort allowlist)', () => {
  it('maps the known sort keys to safe columns', () => {
    expect(buildPageOrderBy('url', 'asc')).toContain('p.url ASC');
    expect(buildPageOrderBy('position', 'desc')).toContain('best_position DESC');
    expect(buildPageOrderBy('issues', 'asc')).toContain('issue_count ASC');
  });

  it('ignores injection / unknown input and falls back to a safe default', () => {
    const clause = buildPageOrderBy('url); DROP TABLE pages;--', 'desc');
    expect(clause).toContain('p.url'); // unknown key → default column
    expect(clause).not.toMatch(/drop/i);
  });

  it('only ever emits ASC or DESC for direction', () => {
    expect(buildPageOrderBy('url', 'whatever')).toContain('ASC');
    expect(buildPageOrderBy('url', 'desc')).toContain('DESC');
  });
});
