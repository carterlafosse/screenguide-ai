// rls.test.js: Phase 1 acceptance. Connected as resolvd_app, row-level security hides every
// tenant row unless the transaction sets an org, and then shows only that org's rows. Also covers
// WITH CHECK, composite foreign keys, the append-only audit log and the SECURITY DEFINER functions.
import { createHash, randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { seedEmail } from '../../db/seeds/users.js';
import {
  getSeedIds,
  inRolledBackTx,
  pgError,
  withAppClient,
  withOwnerClient,
} from '../dbHelpers.js';

const TENANT_TABLES = [
  'users',
  'org_settings',
  'user_preferences',
  'invitations',
  'assist_sessions',
  'session_messages',
  'session_steps',
  'step_snapshots',
  'escalation_tickets',
  'session_feedback',
  'usage_events',
  'audit_events',
  'integration_settings',
  'idempotency_keys',
  'ws_tickets',
];

/** @type {Awaited<ReturnType<typeof getSeedIds>>} */
let ids;

beforeAll(async () => {
  ids = await getSeedIds();
});

describe('RLS as resolvd_app (acceptance)', () => {
  it('SELECT * FROM assist_sessions returns 0 rows when no org is set', async () => {
    const { rowCount } = await withAppClient((c) => c.query('SELECT * FROM assist_sessions'));
    expect(rowCount).toBe(0);
  });

  it("returns only Acme's sessions inside a transaction with Acme's org set", async () => {
    const rows = await withAppClient((c) =>
      inRolledBackTx(
        c,
        ids.acme.id,
        async () => (await c.query('SELECT * FROM assist_sessions')).rows,
      ),
    );
    expect(rows.length).toBe(3);
    expect(rows.every((r) => r.organization_id === ids.acme.id)).toBe(true);
    // Sanity check: the owner (no RLS) really does see both orgs' sessions.
    const total = await withOwnerClient(
      async (c) => (await c.query('SELECT count(*)::int AS n FROM assist_sessions')).rows[0].n,
    );
    expect(total).toBe(6);
  });

  it('the org setting is transaction-local: it is gone after the transaction ends', async () => {
    const counts = await withAppClient(async (c) => {
      const inside = await inRolledBackTx(
        c,
        ids.acme.id,
        async () => (await c.query('SELECT count(*)::int AS n FROM assist_sessions')).rows[0].n,
      );
      const after = (await c.query('SELECT count(*)::int AS n FROM assist_sessions')).rows[0].n;
      return { inside, after };
    });
    expect(counts).toEqual({ inside: 3, after: 0 });
  });

  // Guard for the per-table checks below: they only prove something if both orgs have data.
  it.each(TENANT_TABLES)('%s: the seed has rows for both Acme and Globex', async (table) => {
    const counts = await withOwnerClient(async (c) => {
      const r = await c.query(
        `SELECT organization_id, count(*)::int AS n FROM ${table}
         WHERE organization_id = ANY($1) GROUP BY organization_id`,
        [[ids.acme.id, ids.globex.id]],
      );
      return Object.fromEntries(r.rows.map((x) => [x.organization_id, x.n]));
    });
    expect(counts[ids.acme.id], 'Acme rows').toBeGreaterThan(0);
    expect(counts[ids.globex.id], 'Globex rows').toBeGreaterThan(0);
  });

  it.each(TENANT_TABLES)('%s: 0 rows with no org set', async (table) => {
    const { rowCount } = await withAppClient((c) => c.query(`SELECT * FROM ${table}`));
    expect(rowCount).toBe(0);
  });

  it.each(TENANT_TABLES)(
    "%s: each org sees its own rows and never the other org's",
    async (table) => {
      for (const [own, other] of [
        ['acme', 'globex'],
        ['globex', 'acme'],
      ]) {
        const rows = await withAppClient((c) =>
          inRolledBackTx(
            c,
            ids[own].id,
            async () => (await c.query(`SELECT organization_id FROM ${table}`)).rows,
          ),
        );
        expect(rows.length, `${own} sees its own ${table} rows`).toBeGreaterThan(0);
        expect(
          rows.some((r) => r.organization_id === ids[other].id),
          `${own} sees ${other}'s ${table} rows`,
        ).toBe(false);
        expect(rows.every((r) => r.organization_id === ids[own].id)).toBe(true);
      }
    },
  );

  it('organizations: only your own org is visible', async () => {
    const result = await withAppClient(async (c) => {
      const none = (await c.query('SELECT id FROM organizations')).rows;
      const own = await inRolledBackTx(
        c,
        ids.acme.id,
        async () => (await c.query('SELECT id FROM organizations')).rows,
      );
      return { none, own };
    });
    expect(result.none).toEqual([]);
    expect(result.own).toEqual([{ id: ids.acme.id }]);
  });

  it("WITH CHECK: cannot insert a row for another org while Acme's org is set", async () => {
    const err = await withAppClient((c) =>
      inRolledBackTx(c, ids.acme.id, () =>
        pgError(
          c.query('INSERT INTO assist_sessions (organization_id, user_id) VALUES ($1, $2)', [
            ids.globex.id,
            ids.globex.users.user1,
          ]),
        ),
      ),
    );
    expect(err.code).toBe('42501');
    expect(err.message).toMatch(/row-level security/);
  });

  it("cannot update or delete another org's rows (they are invisible)", async () => {
    const result = await withAppClient((c) =>
      inRolledBackTx(c, ids.acme.id, async () => {
        const upd = await c.query(
          "UPDATE assist_sessions SET title = 'hacked' WHERE organization_id = $1",
          [ids.globex.id],
        );
        const del = await c.query('DELETE FROM session_messages WHERE organization_id = $1', [
          ids.globex.id,
        ]);
        return { updated: upd.rowCount, deleted: del.rowCount };
      }),
    );
    expect(result).toEqual({ updated: 0, deleted: 0 });
  });

  it("composite foreign keys: an Acme session can't reference a Globex user", async () => {
    // As the owner (no RLS), so only the foreign key can stop it.
    const err = await withOwnerClient((c) =>
      inRolledBackTx(c, null, () =>
        pgError(
          c.query('INSERT INTO assist_sessions (organization_id, user_id) VALUES ($1, $2)', [
            ids.acme.id,
            ids.globex.users.user1,
          ]),
        ),
      ),
    );
    expect(err.code).toBe('23503');
  });

  it('audit_events is append-only for resolvd_app (no UPDATE or DELETE)', async () => {
    const errors = await withAppClient(async (c) => {
      const upd = await inRolledBackTx(c, ids.acme.id, () =>
        pgError(c.query("UPDATE audit_events SET action = 'x'")),
      );
      const del = await inRolledBackTx(c, ids.acme.id, () =>
        pgError(c.query('DELETE FROM audit_events')),
      );
      return [upd.code, del.code];
    });
    expect(errors).toEqual(['42501', '42501']);
  });
});

describe('SECURITY DEFINER functions as resolvd_app', () => {
  it('auth_find_user_by_email finds a user with no org set, case-insensitively', async () => {
    const rows = await withAppClient(
      async (c) =>
        (await c.query('SELECT * FROM auth_find_user_by_email($1)', ['ADMIN@Acme.TEST'])).rows,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: ids.acme.users.admin,
      organization_id: ids.acme.id,
      email: seedEmail('acme', 'admin'),
      role: 'admin',
      is_active: true,
    });
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$12\$/);
  });

  it('create_organization creates an org with no org set', async () => {
    const created = await withAppClient((c) =>
      inRolledBackTx(c, null, async () => {
        const { rows } = await c.query('SELECT create_organization($1, $2) AS id', [
          'Test Org',
          'test-org-rls',
        ]);
        return rows[0].id;
      }),
    );
    expect(Number.isInteger(created)).toBe(true);
  });

  it('consume_ws_ticket works once, then never again, and rejects expired tickets', async () => {
    const sessionId = await withOwnerClient(
      async (c) =>
        (
          await c.query('SELECT id FROM assist_sessions WHERE organization_id = $1 LIMIT 1', [
            ids.acme.id,
          ])
        ).rows[0].id,
    );
    const valid = createHash('sha256').update(randomBytes(32)).digest('hex');
    const expired = createHash('sha256').update(randomBytes(32)).digest('hex');

    const result = await withAppClient((c) =>
      inRolledBackTx(c, ids.acme.id, async () => {
        await c.query(
          `INSERT INTO ws_tickets (token_hash, organization_id, user_id, session_id, expires_at)
           VALUES ($1, $3, $4, $5, NOW() + INTERVAL '60 seconds'),
                  ($2, $3, $4, $5, NOW() - INTERVAL '1 second')`,
          [valid, expired, ids.acme.id, ids.acme.users.user1, sessionId],
        );
        const first = (await c.query('SELECT * FROM consume_ws_ticket($1)', [valid])).rows;
        const second = (await c.query('SELECT * FROM consume_ws_ticket($1)', [valid])).rows;
        const late = (await c.query('SELECT * FROM consume_ws_ticket($1)', [expired])).rows;
        return { first, second, late };
      }),
    );
    expect(result.first).toEqual([
      { organization_id: ids.acme.id, user_id: ids.acme.users.user1, session_id: sessionId },
    ]);
    expect(result.second).toEqual([]);
    expect(result.late).toEqual([]);
  });

  it('accept_invitation creates the user in the right org once; reuse is rejected', async () => {
    const tokenHash = createHash('sha256').update(randomBytes(32)).digest('hex');
    const result = await withAppClient(async (c) => {
      await c.query('BEGIN');
      try {
        await c.query("SELECT set_config('app.current_org_id', $1, true)", [String(ids.acme.id)]);
        await c.query(
          `INSERT INTO invitations (organization_id, email, role, token_hash, invited_by, expires_at)
           VALUES ($1, 'New.Person@acme.test', 'technician', $2, $3, NOW() + INTERVAL '7 days')`,
          [ids.acme.id, tokenHash, ids.acme.users.admin],
        );
        // Accepting happens with no org context (the invitee isn't signed in).
        await c.query("SELECT set_config('app.current_org_id', '', true)");
        const accepted = (
          await c.query('SELECT * FROM accept_invitation($1, $2, $3)', [
            tokenHash,
            'New Person',
            'hash',
          ])
        ).rows;
        await c.query('SAVEPOINT reuse');
        const reuse = await pgError(
          c.query('SELECT * FROM accept_invitation($1, $2, $3)', [tokenHash, 'Again', 'hash']),
        );
        await c.query('ROLLBACK TO SAVEPOINT reuse');
        const user = (
          await c.query('SELECT * FROM auth_find_user_by_email($1)', ['new.person@acme.test'])
        ).rows[0];
        return { accepted, reuseMessage: reuse.message, user };
      } finally {
        await c.query('ROLLBACK');
      }
    });
    expect(result.accepted).toEqual([
      { user_id: result.user.id, organization_id: ids.acme.id, role: 'technician' },
    ]);
    expect(result.reuseMessage).toBe('INVITATION_INVALID');
    expect(result.user).toMatchObject({
      organization_id: ids.acme.id,
      email: 'new.person@acme.test',
      role: 'technician',
    });
  });

  it('purge_expired_sessions deletes finished sessions past retention, with their children', async () => {
    const result = await withAppClient((c) =>
      inRolledBackTx(c, ids.acme.id, async () => {
        const { rows } = await c.query(
          `INSERT INTO assist_sessions (organization_id, user_id, status, ended_at, last_activity_at)
           VALUES ($1, $2, 'resolved', NOW() - INTERVAL '91 days', NOW() - INTERVAL '91 days')
           RETURNING id`,
          [ids.acme.id, ids.acme.users.user1],
        );
        await c.query(
          "INSERT INTO session_messages (organization_id, session_id, role, content) VALUES ($1, $2, 'user', 'old')",
          [ids.acme.id, rows[0].id],
        );
        const purged = (await c.query('SELECT purge_expired_sessions() AS n')).rows[0].n;
        const left = (
          await c.query('SELECT count(*)::int AS n FROM session_messages WHERE session_id = $1', [
            rows[0].id,
          ])
        ).rows[0].n;
        const remaining = (await c.query('SELECT count(*)::int AS n FROM assist_sessions')).rows[0]
          .n;
        return { purged, left, remaining };
      }),
    );
    // Only the 91-day-old session goes; the 3 seeded Acme sessions are inside the 90-day retention.
    expect(result).toEqual({ purged: 1, left: 0, remaining: 3 });
  });
});
