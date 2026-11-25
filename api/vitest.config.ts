import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
    // DB integration tests share one database and TRUNCATE between files — run
    // test files sequentially so they don't race each other.
    fileParallelism: false,
  },
});
