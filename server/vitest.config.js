// vitest.config.js: server test runner settings. Loads server/.env (only for the database
// credentials), points both database URLs at screenguide_test, and gives every other required
// variable a fixed, test-only value so tests never depend on (or see) real secrets.
// Test files run one at a time because they share one real PostgreSQL database.
import './src/config/loadDotenv.js';
import { defineConfig } from 'vitest/config';
import { testDatabaseUrls } from './tests/testEnv.js';

const urls = testDatabaseUrls(process.env);

/** Fixed values for tests only. Never used outside `npm test`. */
const TEST_ENV = {
  DATABASE_URL: urls.app,
  MIGRATION_DATABASE_URL: urls.owner,
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  AI_MOCK: 'true',
  SEED_PASSWORD: 'TestOnlySeed123',
  JWT_SECRET: 'ab'.repeat(48),
  ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  CLIENT_ORIGIN: 'http://127.0.0.1:5174',
  PUBLIC_WS_URL: 'ws://127.0.0.1:4001/ws',
  ANTHROPIC_API_KEY: '',
  DEEPGRAM_API_KEY: '',
  ELEVENLABS_API_KEY: '',
  RESEND_API_KEY: '',
};

// globalSetup runs in this process; test workers get the same values through test.env.
Object.assign(process.env, TEST_ENV);

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    globalSetup: ['./tests/globalSetup.js'],
    fileParallelism: false,
    env: TEST_ENV,
  },
});
