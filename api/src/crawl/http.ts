import http from 'node:http';
import https from 'node:https';
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { isIP, type LookupFunction } from 'node:net';
import type { FetchText } from './sitemap';

// SSRF-guarded HTTP for the crawler. Since the crawler fetches user-supplied
// URLs, every request is constrained:
//   - http(s) only, ports 80/443 only
//   - the hostname must not resolve to a private/loopback/link-local/reserved IP
//   - the connection is PINNED to the validated IP (closes the DNS-rebinding
//     window — we connect to the exact address we checked)
//   - each redirect hop is re-validated
//   - timeout + max response size + content-type allowlist
//
// `createFetchText()` returns the `FetchText` the sitemap discovery and page
// fetcher consume. Blocked/failed requests resolve to `null` (unfetchable).

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfError';
  }
}

const DEFAULT_UA =
  'SEO-Keyword-Tracker/0.1 (+https://github.com/rodrigobruner/seo-keyword-tracker)';

// ---- IP classification (pure, unit-tested) -------------------------------

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const v = Number(part);
    if (v > 255) return null;
    n = ((n << 8) | v) >>> 0;
  }
  return n >>> 0;
}

function inRange4(ip: number, base: string, bits: number): boolean {
  const baseInt = ipv4ToInt(base);
  if (baseInt === null) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ip & mask) === (baseInt & mask);
}

// Non-public IPv4 ranges (RFC 1918/6598/3927/5737/1122/multicast/reserved).
const BLOCKED_V4: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

function isBlockedIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true; // unparseable → treat as blocked
  return BLOCKED_V4.some(([base, bits]) => inRange4(n, base, bits));
}

function isBlockedIpv6(ip: string): boolean {
  const addr = ip.toLowerCase().split('%')[0] ?? ''; // strip zone id
  if (addr === '::1' || addr === '::') return true; // loopback / unspecified
  const mapped = addr.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped?.[1]) return isBlockedIpv4(mapped[1]); // IPv4-mapped
  if (/^fe[89ab]/.test(addr)) return true; // link-local fe80::/10
  if (/^f[cd]/.test(addr)) return true; // unique-local fc00::/7
  if (/^ff/.test(addr)) return true; // multicast ff00::/8
  return false;
}

/** True if `ip` is a non-public (blocked) address. Unparseable → blocked. */
export function isBlockedAddress(ip: string): boolean {
  return ip.includes(':') ? isBlockedIpv6(ip) : isBlockedIpv4(ip);
}

// ---- URL validation (pure, unit-tested) ----------------------------------

/** Validate scheme + port + literal-IP host. Throws SsrfError if disallowed. */
export function assertHttpUrl(rawUrl: string): URL {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new SsrfError(`Invalid URL: ${rawUrl}`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new SsrfError(`Blocked protocol: ${u.protocol}`);
  }
  const port = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80;
  if (port !== 80 && port !== 443) {
    throw new SsrfError(`Blocked port: ${port}`);
  }
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) !== 0 && isBlockedAddress(host)) {
    throw new SsrfError(`Blocked address: ${host}`);
  }
  return u;
}

// ---- Pinned, validated fetch ---------------------------------------------

// Resolves the hostname, rejects if ANY resolved IP is non-public, and pins the
// connection to a validated address (closing the rebinding window).
const safeLookup: LookupFunction = (hostname, _options, callback) => {
  dnsLookup(hostname, { all: true }, (err, addresses: LookupAddress[]) => {
    if (err) return callback(err, '', 0);
    const blocked = addresses.find((a) => isBlockedAddress(a.address));
    if (blocked) {
      return callback(new SsrfError(`${hostname} resolves to blocked ${blocked.address}`), '', 0);
    }
    const first = addresses[0];
    if (!first) return callback(new SsrfError(`No DNS results for ${hostname}`), '', 0);
    callback(null, first.address, first.family);
  });
};

export interface FetchOptions {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  userAgent?: string;
}

function isAllowedContentType(ct: string): boolean {
  const c = ct.toLowerCase();
  if (c === '') return true; // some servers omit it on sitemaps
  return c.startsWith('text/') || c.includes('xml') || c.includes('html');
}

interface RawResponse {
  status: number;
  location?: string;
  contentType: string;
  body: string;
}

function requestOnce(rawUrl: string, opts: Required<FetchOptions>): Promise<RawResponse> {
  const u = assertHttpUrl(rawUrl); // re-validates scheme/port/literal IP on every hop
  const mod = u.protocol === 'https:' ? https : http;
  return new Promise<RawResponse>((resolve, reject) => {
    const req = mod.request(
      u,
      {
        method: 'GET',
        lookup: safeLookup,
        headers: { 'user-agent': opts.userAgent, accept: '*/*' },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const contentType = String(res.headers['content-type'] ?? '');
        const location = res.headers.location;
        if (status >= 300 && status < 400 && location) {
          res.resume();
          resolve({ status, location, contentType, body: '' });
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > opts.maxBytes) {
            req.destroy();
            reject(new Error('response exceeds max size'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          resolve({ status, contentType, body: Buffer.concat(chunks).toString('utf8') });
        });
      },
    );
    req.setTimeout(opts.timeoutMs, () => req.destroy(new Error('request timeout')));
    req.on('error', reject);
    req.end();
  });
}

/** Build a FetchText that fetches text with the SSRF guards above. */
export function createFetchText(options: FetchOptions = {}): FetchText {
  const opts: Required<FetchOptions> = {
    maxBytes: options.maxBytes ?? 5_000_000,
    timeoutMs: options.timeoutMs ?? 10_000,
    maxRedirects: options.maxRedirects ?? 5,
    userAgent: options.userAgent ?? DEFAULT_UA,
  };

  return async (url: string): Promise<string | null> => {
    let current = url;
    try {
      for (let i = 0; i <= opts.maxRedirects; i++) {
        const res = await requestOnce(current, opts);
        if (res.status >= 300 && res.status < 400 && res.location) {
          current = new URL(res.location, current).toString();
          continue;
        }
        if (res.status < 200 || res.status >= 300) return null;
        if (!isAllowedContentType(res.contentType)) return null;
        return res.body;
      }
      return null; // too many redirects
    } catch {
      return null; // SSRF / timeout / oversize / network → unfetchable
    }
  };
}
