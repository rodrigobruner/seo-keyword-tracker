// Dev tool: capture the live crawl (robots → sitemaps → first 15 posts) for the
// two seed sites into a committed fixture, so `npm run seed` still works from a
// clean clone if semrush/yoast are slow, change, or block us. Regenerate with:
//   npm -w api run capture-fixtures
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { createFetchText } from '../src/crawl/http';
import { discoverBlogPostUrls } from '../src/crawl/sitemap';
import { fetchPage } from '../src/crawl/fetchPage';

const SITES = ['https://www.semrush.com', 'https://yoast.com'];
const OUT = join(__dirname, '../src/seed/seed-fixtures.json.gz');

async function main() {
  const live = createFetchText();
  const recorded: Record<string, string> = {};
  const recording = async (url: string): Promise<string | null> => {
    const content = await live(url);
    if (content != null) recorded[url] = content;
    return content;
  };

  for (const site of SITES) {
    const urls = await discoverBlogPostUrls(site, { fetchText: recording, maxPosts: 15 });
    for (const u of urls) await fetchPage(u, recording);
    console.log(`${site}: discovered ${urls.length} posts`);
  }

  const gz = gzipSync(JSON.stringify(recorded), { level: 9 });
  writeFileSync(OUT, gz);
  console.log(`Wrote ${Object.keys(recorded).length} URLs → ${OUT} (${(gz.length / 1e6).toFixed(2)} MB gzipped)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
