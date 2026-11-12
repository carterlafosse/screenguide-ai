// seed.test.js: the test-org seed's guards (same checks and order as Resolvd's seed()). It wipes every
// org and its users share one password, so it must never run in production and needs SEED_PASSWORD.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from 'pg';
import { seed } from '../../scripts/lib/seed.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('seed()', () => {
  it('refuses to run when NODE_ENV=production, before connecting to the database', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const connect = vi.spyOn(Client.prototype, 'connect');
    await expect(seed(process.env.MIGRATION_DATABASE_URL)).rejects.toThrow(
      /Refusing to seed: NODE_ENV is production/,
    );
    expect(connect).not.toHaveBeenCalled();
  });

  it('requires SEED_PASSWORD and says where to set it, before connecting', async () => {
    vi.stubEnv('SEED_PASSWORD', '');
    const connect = vi.spyOn(Client.prototype, 'connect');
    await expect(seed(process.env.MIGRATION_DATABASE_URL)).rejects.toThrow(
      /SEED_PASSWORD is not set\. Add it to server\/\.env/,
    );
    expect(connect).not.toHaveBeenCalled();
  });

  it('requires a connection string', async () => {
    await expect(seed(undefined)).rejects.toThrow(/MIGRATION_DATABASE_URL is not set/);
  });
});
