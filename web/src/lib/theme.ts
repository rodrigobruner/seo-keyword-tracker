// Recharts needs concrete colour strings, but the brand palette lives in CSS
// tokens (tokens.css). Read them at runtime so there is a single source of
// truth — no hex is duplicated in JS. See docs/design.md.

/** Resolve a CSS custom property (e.g. "--chart-1") to its computed value. */
export function readToken(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const SERIES_TOKENS = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5', '--chart-6'];

/** Stable per-series colour: keyword index → brand chart colour (cycles). */
export function seriesColor(index: number): string {
  const token = SERIES_TOKENS[index % SERIES_TOKENS.length] ?? '--chart-1';
  return readToken(token) || '#6161ff';
}
