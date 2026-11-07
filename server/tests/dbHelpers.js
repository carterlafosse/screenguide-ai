// dbHelpers.js: direct database helpers for tests that check the schema, RLS and grants.
// Phase 2 adds the app's own pool/withOrg; these stay low-level on purpose.
import { Client } from 'pg';

/**
 * Run fn with a fresh client connected as resolvd_app (RLS applies), then disconnect.
 * @template T
 * @param {(client: import('pg').Client) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withAppClient(fn) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/**
 * Run fn with a fresh client connected as resolvd_owner (owns the tables, bypasses RLS).
 * @template T
 * @param {(client: import('pg').Client) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withOwnerClient(fn) {
  const client = new Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/**
 * Run fn inside a transaction that is always rolled back, so tests leave no trace.
 * Optionally sets the org for the transaction the same way withOrg will.
 * @template T
 * @param {import('pg').ClientBase} client
 * @param {number | null} orgId
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function inRolledBackTx(client, orgId, fn) {
  await client.query('BEGIN');
  try {
    if (orgId !== null) {
      await client.query("SELECT set_config('app.current_org_id', $1, true)", [String(orgId)]);
    }
    return await fn();
  } finally {
    await client.query('ROLLBACK');
  }
}

/**
 * Ids of the seeded orgs and their users, looked up as the owner.
 * @returns {Promise<Record<string, { id: number, users: Record<string, number> }>>}
 */
export async function getSeedIds() {
  return withOwnerClient(async (client) => {
    const { rows } = await client.query(
      `SELECT o.slug, o.id AS org_id, u.id AS user_id, split_part(u.email, '@', 1) AS user_key
       FROM organizations o JOIN users u ON u.organization_id = o.id
       WHERE o.slug IN ('acme', 'globex')`,
    );
    /** @type {Record<string, { id: number, users: Record<string, number> }>} */
    const ids = {};
    for (const r of rows) {
      ids[r.slug] ??= { id: r.org_id, users: {} };
      ids[r.slug].users[r.user_key] = r.user_id;
    }
    return ids;
  });
}

/**
 * Await a promise expected to reject with a PostgreSQL error; returns the error.
 * @param {Promise<unknown>} promise
 * @returns {Promise<Error & { code?: string }>}
 */
export async function pgError(promise) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('Expected the query to fail, but it succeeded');
}
