import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createApp } from '../../../app';
import { hashPassword } from '../../../auth/password';

// Real-database integration test. Gated by RUN_DB_TESTS so `npm test` stays green
// without a database; CI (and the sandbox) run it against a migrated Postgres.
const RUN = process.env.RUN_DB_TESTS === '1';
const EMAIL = 'auth-itest@example.com';
const PASSWORD = 'correct-horse-123';

describe.skipIf(!RUN)('auth integration', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const app = createApp(pool);

  beforeAll(async () => {
    await pool.query('TRUNCATE users RESTART IDENTITY CASCADE');
    await pool.query('INSERT INTO users (email, password_hash) VALUES ($1, $2)', [
      EMAIL,
      await hashPassword(PASSWORD),
    ]);
  });

  afterAll(async () => {
    await pool.query('TRUNCATE users RESTART IDENTITY CASCADE');
    await pool.end();
  });

  it('rejects wrong password and unknown email with 401', async () => {
    await request(app).post('/auth/login').send({ email: EMAIL, password: 'nope' }).expect(401);
    await request(app)
      .post('/auth/login')
      .send({ email: 'ghost@example.com', password: 'x' })
      .expect(401);
  });

  it('logs in (httpOnly cookie) and serves /me; no cookie → 401', async () => {
    const agent = request.agent(app);
    const login = await agent.post('/auth/login').send({ email: EMAIL, password: PASSWORD }).expect(200);
    expect(login.body.email).toBe(EMAIL);
    expect(String(login.headers['set-cookie'])).toContain('HttpOnly');

    const me = await agent.get('/auth/me').expect(200);
    expect(me.body.email).toBe(EMAIL);

    await request(app).get('/auth/me').expect(401); // no session cookie
  });
});
