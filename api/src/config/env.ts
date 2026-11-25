import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// Load .env from the repo root when present (dev). In production real env vars
// are set and the file is absent — dotenv is a no-op then.
loadDotenv({ path: resolve(__dirname, '../../../.env') });

// Validated, typed environment. The process refuses to start on invalid config
// (fail fast) — notably a SESSION_SECRET that is too short.
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(4000),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  APP_TIMEZONE: z.string().min(1).default('America/Toronto'),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('[env] invalid environment configuration:');
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}

export const env: Env = loadEnv();
