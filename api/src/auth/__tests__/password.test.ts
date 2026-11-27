import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, DUMMY_HASH } from '../password';

describe('password', () => {
  it('hashes and verifies', async () => {
    const hash = await hashPassword('secret123');
    expect(hash).not.toBe('secret123');
    expect(await verifyPassword('secret123', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('exposes a valid dummy hash for anti-enumeration', async () => {
    expect(await verifyPassword('anything', DUMMY_HASH)).toBe(false);
  });
});
