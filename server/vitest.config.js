// vitest.config.js: server test runner settings. Loads server/.env, points both database URLs at
// screenguide_test, and runs test files one at a time (they share one real PostgreSQL database).
import 'dotenv/config';
import { defineConfig } from 'vitest/config';
import { testDatabaseUrls } from './tests/testEnv.js';

const urls = testDatabaseUrls(process.env);

// globalSetup runs in this process; test workers get the same values through test.env.
process.env.DATABASE_URL = urls.app;
process.env.MIGRATION_DATABASE_URL = urls.owner;
process.env.NODE_ENV = 'test';
process.env.AI_MOCK = 'true';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    globalSetup: ['./tests/globalSetup.js'],
    fileParallelism: false,
    env: {
      DATABASE_URL: urls.app,
      MIGRATION_DATABASE_URL: urls.owner,
      NODE_ENV: 'test',
      AI_MOCK: 'true',
    },
  },
});
