import jwt from 'jsonwebtoken';
import { env } from '../config/env';

// Stateless session = a JWT signed with SESSION_SECRET, carried in an httpOnly
// cookie. The verify algorithm is pinned (HS256) to prevent algorithm confusion.

const ALGORITHM = 'HS256' as const;
const EXPIRES_IN = '7d';

export interface SessionClaims {
  userId: number;
}

export function signSession(userId: number): string {
  return jwt.sign({ userId }, env.SESSION_SECRET, { algorithm: ALGORITHM, expiresIn: EXPIRES_IN });
}

export function verifySession(token: string): SessionClaims | null {
  try {
    const decoded = jwt.verify(token, env.SESSION_SECRET, { algorithms: [ALGORITHM] });
    if (typeof decoded === 'object' && decoded !== null && typeof decoded.userId === 'number') {
      return { userId: decoded.userId };
    }
    return null;
  } catch {
    return null;
  }
}
