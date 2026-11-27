import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import type { FetchText } from '../crawl/sitemap';

// A committed snapshot (url → raw content) of the live crawl for the seed sites,
// captured by `scripts/capture-fixtures.ts`. Used only as a fallback.
const FIXTURE_PATH = join(__dirname, 'seed-fixtures.json.gz');

function loadFixtures(): Record<string, string> {
  if (!existsSync(FIXTURE_PATH)) return {};
  try {
    return JSON.parse(gunzipSync(readFileSync(FIXTURE_PATH)).toString('utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}

/**
 * Wrap a FetchText so that when the live fetch returns null (site slow, changed,
 * or blocking us), it falls back to the committed fixture for that URL. Keeps
 * `npm run seed` working from a clean clone without depending on the live sites.
 */
export function withFixtureFallback(live: FetchText): FetchText {
  const fixtures = loadFixtures();
  return async (url: string): Promise<string | null> => {
    const content = await live(url);
    return content != null ? content : (fixtures[url] ?? null);
  };
}
