// withOrg.js: transaction helpers, same signatures as Resolvd (plan Section 4.1).
//   withTransaction(work)  BEGIN → work(client) → COMMIT (ROLLBACK on error), always release.
//   setOrg(client, orgId)  sets app.current_org_id for the current transaction only.
//   withOrg(orgId, work)   BEGIN → set_config('app.current_org_id', orgId, true) → work → COMMIT.
// All tenant queries inside `work` must use the client passed in, never pool.query.
import { pool } from './pool.js';

/**
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} work
 * @returns {Promise<T>}
 */
export async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // The original error matters more than a failed rollback (e.g. lost connection).
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Set the org for the current transaction (transaction-local: gone at COMMIT/ROLLBACK).
 * @param {import('pg').ClientBase} client
 * @param {number} orgId
 */
export async function setOrg(client, orgId) {
  if (!Number.isInteger(orgId) || orgId <= 0) {
    throw new TypeError(`setOrg: orgId must be a positive integer (got ${String(orgId)})`);
  }
  await client.query("SELECT set_config('app.current_org_id', $1, true)", [String(orgId)]);
}

/**
 * @template T
 * @param {number} orgId
 * @param {(client: import('pg').PoolClient) => Promise<T>} work
 * @returns {Promise<T>}
 */
export async function withOrg(orgId, work) {
  return withTransaction(async (client) => {
    await setOrg(client, orgId);
    return work(client);
  });
}
