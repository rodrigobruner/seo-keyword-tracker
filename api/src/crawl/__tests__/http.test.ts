import { describe, it, expect } from 'vitest';
import { isBlockedAddress, assertHttpUrl, SsrfError } from '../http';

describe('isBlockedAddress', () => {
  it('blocks private, loopback, link-local and reserved IPv4', () => {
    for (const ip of [
      '127.0.0.1',
      '10.0.0.5',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.10.20',
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
      '240.0.0.1',
      '198.18.0.1',
    ]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it('blocks loopback, ULA, link-local, multicast and mapped IPv4 for IPv6', () => {
    for (const ip of ['::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '::ffff:127.0.0.1']) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it('allows public addresses', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.15.0.1', '172.32.0.1']) {
      expect(isBlockedAddress(ip), ip).toBe(false);
    }
    expect(isBlockedAddress('2606:4700:4700::1111')).toBe(false);
  });

  it('treats unparseable input as blocked', () => {
    expect(isBlockedAddress('999.1.1.1')).toBe(true);
    expect(isBlockedAddress('not-an-ip')).toBe(true);
  });
});

describe('assertHttpUrl', () => {
  it('accepts normal http(s) URLs', () => {
    expect(assertHttpUrl('https://example.com/blog').host).toBe('example.com');
    expect(assertHttpUrl('http://example.com:80/').host).toBe('example.com');
    expect(assertHttpUrl('https://example.com:443/').host).toBe('example.com');
  });

  it('rejects non-http(s) protocols', () => {
    expect(() => assertHttpUrl('ftp://example.com')).toThrow(SsrfError);
    expect(() => assertHttpUrl('file:///etc/passwd')).toThrow(SsrfError);
  });

  it('rejects non-80/443 ports', () => {
    expect(() => assertHttpUrl('http://example.com:8080/')).toThrow(SsrfError);
    expect(() => assertHttpUrl('http://example.com:22/')).toThrow(SsrfError);
  });

  it('rejects literal private/loopback IP hosts', () => {
    expect(() => assertHttpUrl('http://127.0.0.1/')).toThrow(SsrfError);
    expect(() => assertHttpUrl('http://169.254.169.254/latest/meta-data')).toThrow(SsrfError);
    expect(() => assertHttpUrl('http://[::1]/')).toThrow(SsrfError);
  });
});
