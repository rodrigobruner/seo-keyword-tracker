import type { Request, Response, NextFunction } from 'express';
import { verifySession } from '../auth/jwt';
import { SESSION_COOKIE } from '../auth/cookie';

// Gate for authenticated routes. Reads the session cookie, verifies the JWT, and
// sets req.userId. Every resource query is then scoped by this id (tenancy).
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  const claims = typeof token === 'string' ? verifySession(token) : null;
  if (!claims) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  req.userId = claims.userId;
  next();
}
