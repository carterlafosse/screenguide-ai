// seed.test.js: the test-org seed refuses to run in production (its users share a known password).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from 'pg';
import { seed } from '../../scripts/seed.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('seed()', () => {
  it('refuses to run when NODE_ENV=production, before connecting to the database', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const connect = vi.spyOn(Client.prototype, 'connect');
    await expect(seed(process.env.MIGRATION_DATABASE_URL)).rejects.toThrow(
      /refusing to run with NODE_ENV=production/,
    );
    expect(connect).not.toHaveBeenCalled();
  });
});
