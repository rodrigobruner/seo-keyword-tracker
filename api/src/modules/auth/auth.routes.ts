import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { Pool } from 'pg';
import { UserRepository } from '../../repositories/user-repository';
import { verifyPassword, DUMMY_HASH } from '../../auth/password';
import { signSession } from '../../auth/jwt';
import { setSessionCookie, clearSessionCookie } from '../../auth/cookie';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/async-handler';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});

export function authRouter(pool: Pool): Router {
  const users = new UserRepository(pool);
  const router = Router();

  router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid credentials' });
      return;
    }
    const { email, password } = parsed.data;
    const user = await users.findByEmail(email);
    // Always run a compare (dummy hash when unknown) so timing doesn't leak
    // whether the account exists.
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      res.status(401).json({ error: 'invalid credentials' });
      return;
    }
    setSessionCookie(res, signSession(user.id));
    res.json({ id: user.id, email: user.email });
  }));

  router.post('/logout', (_req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  router.get('/me', requireAuth, asyncHandler(async (req, res) => {
    const user = await users.findPublicById(req.userId!);
    if (!user) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    res.json(user);
  }));

  return router;
}
