import bcrypt from 'bcryptjs';

const COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// A valid hash to compare against when the email is unknown, so login timing
// doesn't reveal whether an account exists (anti-enumeration).
export const DUMMY_HASH = bcrypt.hashSync('unused-dummy-password', COST);
