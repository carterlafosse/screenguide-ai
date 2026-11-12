// audit.test.js: recordAudit writes in the caller's transaction (commits and rolls back with the
// change), accepts only known actions, and RLS stops writing an event for another org.
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { withOrg } from '../../src/db/withOrg.js';
import { AUDIT_ACTIONS, recordAudit } from '../../src/modules/audit/audit.service.js';
import { getSeedIds, withOwnerClient } from '../dbHelpers.js';

let ids;
beforeAll(async () => {
  ids = await getSeedIds();
});

const findByRequestId = (requestId) =>
  withOwnerClient(
    async (c) =>
      (await c.query('SELECT * FROM audit_events WHERE request_id = $1', [requestId])).rows,
  );

describe('recordAudit', () => {
  it('lists exactly the actions required by plan Section 8.3', () => {
    expect([...AUDIT_ACTIONS].sort()).toEqual(
      [
        'auth.login',
        'auth.login_failed',
        'auth.locked',
        'org.registered',
        'user.created',
        'user.role_changed',
        'user.deactivated',
        'invitation.sent',
        'invitation.accepted',
        'invitation.revoked',
        'org.settings_updated',
        'integration.updated',
        'session.deleted',
        'org.exported',
        'ticket.pushed',
        'ticket.push_failed',
        'safety.blocked',
      ].sort(),
    );
  });

  it('writes every field inside the transaction', async () => {
    const requestId = randomUUID();
    await withOrg(ids.acme.id, (client) =>
      recordAudit(client, {
        orgId: ids.acme.id,
        actorId: ids.acme.users.admin,
        action: 'user.role_changed',
        entityType: 'user',
        entityId: ids.acme.users.user1,
        meta: { from: 'end_user', to: 'technician' },
        requestId,
        ip: '::ffff:127.0.0.1',
      }),
    );
    const rows = await findByRequestId(requestId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      organization_id: ids.acme.id,
      actor_id: ids.acme.users.admin,
      action: 'user.role_changed',
      entity_type: 'user',
      entity_id: String(ids.acme.users.user1),
      meta: { from: 'end_user', to: 'technician' },
      ip: '::ffff:127.0.0.1',
    });
  });

  it('rolls back with the change it describes', async () => {
    const requestId = randomUUID();
    await expect(
      withOrg(ids.acme.id, async (client) => {
        await recordAudit(client, { orgId: ids.acme.id, action: 'session.deleted', requestId });
        throw new Error('the change failed');
      }),
    ).rejects.toThrow('the change failed');
    expect(await findByRequestId(requestId)).toEqual([]);
  });

  it('rejects unknown actions before writing anything', async () => {
    const requestId = randomUUID();
    await expect(
      withOrg(ids.acme.id, (client) =>
        recordAudit(client, { orgId: ids.acme.id, action: 'user.hacked', requestId }),
      ),
      // A plain Error (500), not a ZodError, which the error handler would answer as a 400.
    ).rejects.toThrow(/recordAudit: invalid event/);
    expect(await findByRequestId(requestId)).toEqual([]);
  });

  it('stores null for an unparseable ip instead of failing', async () => {
    const requestId = randomUUID();
    await withOrg(ids.acme.id, (client) =>
      recordAudit(client, { orgId: ids.acme.id, action: 'auth.login', requestId, ip: 'garbage' }),
    );
    expect((await findByRequestId(requestId))[0].ip).toBeNull();
  });

  it("RLS: can't write an event for a different org than the transaction's", async () => {
    await expect(
      withOrg(ids.acme.id, (client) =>
        recordAudit(client, { orgId: ids.globex.id, action: 'auth.login' }),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });
});
