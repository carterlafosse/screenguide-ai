// idempotency.queries.js: SQL for idempotency keys. Every function takes the transaction's client.

/**
 * Insert a new in-progress key. Returns false if the key already exists for this user.
 * @param {import('pg').ClientBase} client
 * @param {{ orgId: number, userId: number, key: string, requestHash: string }} k
 */
export async function insertKey(client, { orgId, userId, key, requestHash }) {
  const { rowCount } = await client.query(
    `INSERT INTO idempotency_keys (organization_id, user_id, key, request_hash, status)
     VALUES ($1, $2, $3, $4, 'in_progress')
     ON CONFLICT (organization_id, user_id, key) DO NOTHING`,
    [orgId, userId, key, requestHash],
  );
  return rowCount === 1;
}

/**
 * Lock and return an existing key row.
 * @param {import('pg').ClientBase} client
 * @param {{ orgId: number, userId: number, key: string }} k
 */
export async function findKeyForUpdate(client, { orgId, userId, key }) {
  const { rows } = await client.query(
    `SELECT request_hash, status, response_code, response_body,
            created_at < NOW() - make_interval(secs => $4) AS stale
     FROM idempotency_keys
     WHERE organization_id = $1 AND user_id = $2 AND key = $3
     FOR UPDATE`,
    [orgId, userId, key, STALE_IN_PROGRESS_SECONDS],
  );
  return rows[0] ?? null;
}

/** An in-progress key older than this is treated as abandoned (e.g. the server restarted mid-request). */
export const STALE_IN_PROGRESS_SECONDS = 300;

/**
 * Take over an abandoned in-progress key (restarts its clock).
 * @param {import('pg').ClientBase} client
 * @param {{ orgId: number, userId: number, key: string }} k
 */
export async function reclaimKey(client, { orgId, userId, key }) {
  await client.query(
    `UPDATE idempotency_keys SET created_at = NOW()
     WHERE organization_id = $1 AND user_id = $2 AND key = $3 AND status = 'in_progress'`,
    [orgId, userId, key],
  );
}

/**
 * @param {import('pg').ClientBase} client
 * @param {{ orgId: number, userId: number, key: string, responseCode: number, responseBody: unknown }} k
 */
export async function completeKey(client, { orgId, userId, key, responseCode, responseBody }) {
  await client.query(
    `UPDATE idempotency_keys
     SET status = 'completed', response_code = $4, response_body = $5
     WHERE organization_id = $1 AND user_id = $2 AND key = $3`,
    [orgId, userId, key, responseCode, JSON.stringify(responseBody ?? null)],
  );
}

/**
 * @param {import('pg').ClientBase} client
 * @param {{ orgId: number, userId: number, key: string }} k
 */
export async function deleteKey(client, { orgId, userId, key }) {
  await client.query(
    'DELETE FROM idempotency_keys WHERE organization_id = $1 AND user_id = $2 AND key = $3',
    [orgId, userId, key],
  );
}
