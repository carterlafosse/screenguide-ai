// withOrg.test.js: the transaction helpers. withOrg scopes RLS to one org for one transaction,
// rolls back on error, never leaks the org setting to the next user of a pooled connection, and
// always returns the connection to the pool.
import { beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../../src/db/pool.js';
import { setOrg, withOrg, withTransaction } from '../../src/db/withOrg.js';
import { getSeedIds, withOwnerClient } from '../dbHelpers.js';

let ids;
beforeAll(async () => {
  ids = await getSeedIds();
});

const countSessions = (client) =>
  client.query('SELECT organization_id FROM assist_sessions').then((r) => r.rows);

describe('withOrg', () => {
  it("sees only the given org's rows", async () => {
    const rows = await withOrg(ids.acme.id, countSessions);
    expect(rows.length).toBe(3);
    expect(rows.every((r) => r.organization_id === ids.acme.id)).toBe(true);
  });

  it('withTransaction without an org sees no tenant rows', async () => {
    expect(await withTransaction(countSessions)).toEqual([]);
  });

  it('rolls back everything if work throws, and rethrows the error', async () => {
    const marker = `rollback-${Date.now()}`;
    const sessionId = await withOwnerClient(
      async (c) =>
        (
          await c.query('SELECT id FROM assist_sessions WHERE organization_id = $1 LIMIT 1', [
            ids.acme.id,
          ])
        ).rows[0].id,
    );
    await expect(
      withOrg(ids.acme.id, async (client) => {
        await client.query(
          "INSERT INTO session_messages (organization_id, session_id, role, content) VALUES ($1, $2, 'user', $3)",
          [ids.acme.id, sessionId, marker],
        );
        throw new Error('fail after insert');
      }),
    ).rejects.toThrow('fail after insert');
    const found = await withOwnerClient(
      async (c) =>
        (await c.query('SELECT 1 FROM session_messages WHERE content = $1', [marker])).rowCount,
    );
    expect(found).toBe(0);
  });

  it('does not leak the org to the next transaction on a reused connection', async () => {
    // Run many alternating transactions so pooled connections are certainly reused.
    for (let i = 0; i < 10; i += 1) {
      const org = i % 2 === 0 ? ids.acme : ids.globex;
      const rows = await withOrg(org.id, countSessions);
      expect(rows.every((r) => r.organization_id === org.id)).toBe(true);
      expect(await withTransaction(countSessions)).toEqual([]);
    }
  });

  it('always releases its connection, even after errors', async () => {
    await expect(withOrg(ids.acme.id, () => Promise.reject(new Error('x')))).rejects.toThrow();
    await expect(
      withOrg(ids.acme.id, (c) => c.query('SELECT * FROM no_such_table')),
    ).rejects.toThrow();
    expect(pool.waitingCount).toBe(0);
    expect(pool.idleCount).toBe(pool.totalCount);
  });

  it.each([0, -1, 1.5, '1', null, undefined, Number.NaN])(
    'rejects invalid org id %s',
    async (bad) => {
      await expect(withOrg(bad, countSessions)).rejects.toThrow(/positive integer/);
    },
  );
});

describe('setOrg', () => {
  it('sets the org for the current transaction only', async () => {
    const result = await withTransaction(async (client) => {
      const before = (await countSessions(client)).length;
      await setOrg(client, ids.globex.id);
      const after = await countSessions(client);
      return { before, after };
    });
    expect(result.before).toBe(0);
    expect(result.after.length).toBe(3);
    expect(result.after.every((r) => r.organization_id === ids.globex.id)).toBe(true);
  });
});
