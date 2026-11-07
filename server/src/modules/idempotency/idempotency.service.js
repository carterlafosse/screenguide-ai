// idempotency.service.js: rules for Idempotency-Key handling (plan Section 8.4). Each step runs in
// its own short withOrg transaction, separate from the request's own work, so a concurrent duplicate
// sees the key as in progress while the first request is still running.
import { createHash } from 'node:crypto';
import { withOrg } from '../../db/withOrg.js';
import {
  completeKey,
  deleteKey,
  findKeyForUpdate,
  insertKey,
  reclaimKey,
} from './idempotency.queries.js';

/** JSON with object keys sorted at every level, so key order never changes the hash. */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * Fingerprint of a request: method, path (with query string) and body.
 * @param {string} method
 * @param {string} url
 * @param {unknown} body
 */
export function hashRequest(method, url, body) {
  return createHash('sha256')
    .update(`${method.toUpperCase()} ${url}\n${stableStringify(body)}`)
    .digest('hex');
}

/**
 * @typedef {{ orgId: number, userId: number, key: string }} KeyIds
 * @typedef {{ state: 'new' } | { state: 'mismatch' } | { state: 'in_progress' }
 *   | { state: 'completed', responseCode: number, responseBody: unknown }} BeginOutcome
 */

/**
 * Claim a key for a new request, or report what already happened with it.
 * @param {KeyIds & { requestHash: string }} input
 * @returns {Promise<BeginOutcome>}
 */
export async function beginRequest(input) {
  return withOrg(input.orgId, async (client) => {
    if (await insertKey(client, input)) return { state: 'new' };

    const row = await findKeyForUpdate(client, input);
    if (!row) {
      // Deleted between our insert attempt and the lookup (e.g. a 5xx cleanup). Claim it now.
      return (await insertKey(client, input)) ? { state: 'new' } : { state: 'in_progress' };
    }
    if (row.request_hash !== input.requestHash) return { state: 'mismatch' };
    if (row.status === 'completed') {
      return {
        state: 'completed',
        responseCode: row.response_code,
        responseBody: row.response_body,
      };
    }
    if (row.stale) {
      await reclaimKey(client, input);
      return { state: 'new' };
    }
    return { state: 'in_progress' };
  });
}

/**
 * Store the response so repeats can replay it.
 * @param {KeyIds & { responseCode: number, responseBody: unknown }} input
 */
export async function completeRequest(input) {
  await withOrg(input.orgId, (client) => completeKey(client, input));
}

/**
 * Forget the key (server error or no stored response), so the client can safely retry.
 * @param {KeyIds} input
 */
export async function abandonRequest(input) {
  await withOrg(input.orgId, (client) => deleteKey(client, input));
}
