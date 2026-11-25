import type { Pool } from 'pg';

export interface UserRow {
  id: number;
  email: string;
  passwordHash: string;
}

export interface PublicUser {
  id: number;
  email: string;
}

export class UserRepository {
  constructor(private readonly pool: Pool) {}

  async findByEmail(email: string): Promise<UserRow | null> {
    const res = await this.pool.query<{ id: number; email: string; password_hash: string }>(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email],
    );
    const row = res.rows[0];
    return row ? { id: row.id, email: row.email, passwordHash: row.password_hash } : null;
  }

  async findPublicById(id: number): Promise<PublicUser | null> {
    const res = await this.pool.query<PublicUser>('SELECT id, email FROM users WHERE id = $1', [id]);
    return res.rows[0] ?? null;
  }
}
