// vitest.config.js: server test runner settings (real PostgreSQL tests run one file at a time).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    fileParallelism: false,
  },
});
