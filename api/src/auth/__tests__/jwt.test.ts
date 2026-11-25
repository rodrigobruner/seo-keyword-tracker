import { describe, it, expect } from 'vitest';
import { signSession, verifySession } from '../jwt';

describe('jwt session', () => {
  it('round-trips a session', () => {
    const token = signSession(42);
    expect(verifySession(token)).toEqual({ userId: 42 });
  });

  it('rejects malformed or tampered tokens', () => {
    expect(verifySession('not.a.jwt')).toBeNull();
    expect(verifySession(signSession(1) + 'tamper')).toBeNull();
  });
});
