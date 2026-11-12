// globalSetup.js: runs once before the test files. Resets the screenguide_test database to an
// empty public schema, applies every migration and seeds Acme Corp and Globex.
import { Client } from 'pg';
import { migrate } from '../scripts/lib/migrate.js';
import { seed } from '../scripts/lib/seed.js';
import { assertTestDatabase } from './testEnv.js';

async function resetSchema(ownerUrl) {
  assertTestDatabase(ownerUrl);
  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS pgboss CASCADE');
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
  } finally {
    await client.end();
  }
}

export default async function globalSetup() {
  // vitest.config.js has already pointed these at screenguide_test.
  const ownerUrl = process.env.MIGRATION_DATABASE_URL;
  await resetSchema(ownerUrl);
  await migrate(ownerUrl);
  await seed(ownerUrl, { log: () => {} });
}
