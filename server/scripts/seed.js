// seed.js: seeds the two test organizations, Acme Corp and Globex (users, settings, preferences,
// sessions with messages and steps, one escalation each, and at least one row in every other
// tenant table). Runs as resolvd_owner in one transaction.
// Safe to rerun: existing Acme/Globex data is removed first. Other orgs are never touched.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';
import { Client } from 'pg';
import { SEED_ORGS, SEED_PASSWORD } from '../db/seeds/users.js';

const BCRYPT_COST = 12;

// Tenant tables in delete order (children before parents).
const TENANT_TABLES_DELETE_ORDER = [
  'ws_tickets',
  'idempotency_keys',
  'integration_settings',
  'audit_events',
  'usage_events',
  'session_feedback',
  'escalation_tickets',
  'step_snapshots',
  'session_steps',
  'session_messages',
  'assist_sessions',
  'invitations',
  'user_preferences',
  'org_settings',
  'users',
];

/**
 * Delete everything belonging to the given org slugs.
 * @param {import('pg').ClientBase} client
 * @param {string[]} slugs
 */
async function removeOrgs(client, slugs) {
  const { rows } = await client.query('SELECT id FROM organizations WHERE slug = ANY($1)', [slugs]);
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return;
  for (const table of TENANT_TABLES_DELETE_ORDER) {
    // Table names come from the constant list above, never from input.
    await client.query(`DELETE FROM ${table} WHERE organization_id = ANY($1)`, [ids]);
  }
  await client.query('DELETE FROM organizations WHERE id = ANY($1)', [ids]);
}

/**
 * Insert one session with its messages and steps; returns the session id.
 * @param {import('pg').ClientBase} client
 */
async function insertSession(
  client,
  {
    orgId,
    userId,
    status,
    title,
    category,
    startedMinutesAgo,
    durationMinutes,
    finalSummary,
    messages,
    steps,
  },
) {
  const { rows } = await client.query(
    `INSERT INTO assist_sessions
       (organization_id, user_id, status, title, category, turn_count, ai_call_count,
        input_modes_used, client_info, started_at, last_activity_at, ended_at, duration_seconds,
        final_summary)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
             NOW() - make_interval(mins => $10),
             NOW() - make_interval(mins => $10 - $11),
             CASE WHEN $13 THEN NULL ELSE NOW() - make_interval(mins => $10 - $11) END,
             CASE WHEN $13 THEN NULL ELSE $11 * 60 END,
             $12)
     RETURNING id`,
    [
      orgId,
      userId,
      status,
      title,
      category,
      messages.filter((m) => m.role === 'user').length,
      messages.filter((m) => m.role === 'assistant').length,
      ['voice', 'text'],
      JSON.stringify({ os: 'Windows 11', browser: 'Chrome' }),
      startedMinutesAgo,
      durationMinutes,
      finalSummary,
      status === 'active' || status === 'paused',
    ],
  );
  const sessionId = rows[0].id;

  for (const [i, m] of messages.entries()) {
    await client.query(
      `INSERT INTO session_messages (organization_id, session_id, role, content, input_mode, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW() - make_interval(mins => $6) + make_interval(secs => $7))`,
      [
        orgId,
        sessionId,
        m.role,
        m.content,
        m.role === 'user' ? 'voice' : null,
        startedMinutesAgo,
        i * 20,
      ],
    );
  }

  for (const [i, s] of steps.entries()) {
    await client.query(
      `INSERT INTO session_steps
         (organization_id, session_id, step_index, title, instruction, expected_outcome, outcome,
          attempts, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
               CASE WHEN $10 THEN NOW() - make_interval(mins => $9) ELSE NULL END)`,
      [
        orgId,
        sessionId,
        i,
        s.title,
        s.instruction,
        s.expectedOutcome,
        s.outcome,
        s.attempts ?? 1,
        startedMinutesAgo - 2,
        s.outcome === 'completed',
      ],
    );
  }

  return sessionId;
}

/**
 * Seed one organization.
 * @param {import('pg').ClientBase} client
 * @param {(typeof SEED_ORGS)[number]} org
 * @param {string} passwordHash
 */
async function seedOrg(client, org, passwordHash) {
  const { rows: orgRows } = await client.query(
    'INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id',
    [org.name, org.slug],
  );
  const orgId = orgRows[0].id;

  await client.query(
    `INSERT INTO org_settings (organization_id, plan, retention_days, save_snapshots, it_contact_email)
     VALUES ($1, 'team', 90, TRUE, $2)`,
    [orgId, org.itContactEmail],
  );

  /** @type {Record<string, number>} */
  const userIds = {};
  for (const u of org.users) {
    const { rows } = await client.query(
      `INSERT INTO users (organization_id, name, email, password_hash, role, department)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [orgId, u.name, u.email, passwordHash, u.role, u.department],
    );
    userIds[u.key] = rows[0].id;
    await client.query(
      `INSERT INTO user_preferences (organization_id, user_id, first_name, consented_at, consent_version)
       VALUES ($1, $2, $3, NOW() - INTERVAL '7 days', '2026-11')`,
      [orgId, rows[0].id, u.name.split(' ')[0]],
    );
  }

  // 1. Resolved printer session, with feedback and usage.
  const resolvedId = await insertSession(client, {
    orgId,
    userId: userIds.user1,
    status: 'resolved',
    title: `Printer offline (${org.name})`,
    category: 'printer',
    startedMinutesAgo: 2 * 24 * 60,
    durationMinutes: 6,
    finalSummary: 'The printer was paused. Resuming it in Printers & scanners fixed the problem.',
    messages: [
      { role: 'assistant', content: 'Hi, I can see your screen now. What is going on?' },
      { role: 'user', content: 'My printer says it is offline.' },
      { role: 'assistant', content: 'Let us fix that. Click the Start button and type printers.' },
      { role: 'user', content: 'Okay, it printed. Thanks!' },
      { role: 'assistant', content: 'Great, glad that worked.' },
    ],
    steps: [
      {
        title: 'Open Printers & scanners',
        instruction: 'Click Start, type printers, then choose Printers & scanners.',
        expectedOutcome: 'The Printers & scanners settings page is open.',
        outcome: 'completed',
      },
      {
        title: 'Resume the printer',
        instruction: 'Click your printer, open the print queue and choose Resume printing.',
        expectedOutcome: 'The printer status changes to Ready.',
        outcome: 'completed',
      },
    ],
  });
  await client.query(
    `INSERT INTO session_feedback (organization_id, session_id, user_id, rating, comment)
     VALUES ($1, $2, $3, 5, 'Quick and easy.')`,
    [orgId, resolvedId, userIds.user1],
  );
  await client.query(
    `INSERT INTO usage_events
       (organization_id, session_id, user_id, type, model, input_tokens, output_tokens, latency_ms)
     VALUES ($1, $2, $3, 'turn', 'claude-haiku-5-5', 2400, 120, 1800),
            ($1, $2, $3, 'observe', 'claude-haiku-5-5', 1900, 60, 1200)`,
    [orgId, resolvedId, userIds.user1],
  );

  // 2. Escalated network session with a ticket.
  const escalatedId = await insertSession(client, {
    orgId,
    userId: userIds.user2,
    status: 'escalated',
    title: `No internet on Wi-Fi (${org.name})`,
    category: 'network',
    startedMinutesAgo: 24 * 60,
    durationMinutes: 12,
    finalSummary: 'Wi-Fi connects but has no internet. Rejoining did not help; escalated to IT.',
    messages: [
      { role: 'user', content: 'The Wi-Fi says connected but nothing loads.' },
      { role: 'assistant', content: 'Let us try forgetting the network and joining it again.' },
      { role: 'user', content: 'Still nothing.' },
      {
        role: 'assistant',
        content: 'This needs your IT person. I will write up a ticket for them.',
      },
    ],
    steps: [
      {
        title: 'Forget and rejoin the network',
        instruction: 'Open Wi-Fi settings, choose Forget, then connect again.',
        expectedOutcome: 'Web pages load again.',
        outcome: 'failed',
        attempts: 2,
      },
    ],
  });
  await client.query(
    `INSERT INTO escalation_tickets
       (organization_id, session_id, title, summary, environment, steps_tried, current_state,
        suspected_cause, urgency, suggested_priority, category_hint)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'high', 'high', 'network')`,
    [
      orgId,
      escalatedId,
      'Wi-Fi connected but no internet',
      'User is connected to the office Wi-Fi but no websites load. Rejoining the network did not help.',
      JSON.stringify({ windowsVersion: '11', apps: ['Chrome'] }),
      JSON.stringify([{ step: 'Forget and rejoin the network', result: 'No change' }]),
      'Connected, no internet access.',
      'Router or DHCP problem',
    ],
  );

  // 3. Active email session (in progress).
  const activeId = await insertSession(client, {
    orgId,
    userId: userIds.user3,
    status: 'active',
    title: null,
    category: 'email',
    startedMinutesAgo: 5,
    durationMinutes: 0,
    finalSummary: null,
    messages: [{ role: 'user', content: 'Outlook is not getting new email.' }],
    steps: [],
  });

  await client.query(
    `INSERT INTO audit_events (organization_id, actor_id, action, entity_type, entity_id, meta)
     VALUES ($1, $2, 'org.registered', 'organization', $3, $4)`,
    [orgId, userIds.admin, String(orgId), JSON.stringify({ seeded: true })],
  );

  await seedRemainingTables(client, { org, orgId, userIds, resolvedId, activeId });

  return { orgId, userIds };
}

// A 1×1 grey JPEG: stands in for a downscaled step snapshot (synthetic, not a real screen).
const PLACEHOLDER_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

/**
 * Give the tables the sessions above don't fill at least one row per org, so every tenant table
 * has data for both orgs and the RLS isolation tests can't pass trivially.
 * @param {import('pg').ClientBase} client
 */
async function seedRemainingTables(client, { org, orgId, userIds, resolvedId, activeId }) {
  // Open invitation (token is random and unknown; only its hash is stored).
  await client.query(
    `INSERT INTO invitations (organization_id, email, role, token_hash, invited_by, expires_at)
     VALUES ($1, $2, 'end_user', $3, $4, NOW() + INTERVAL '7 days')`,
    [orgId, `newhire@${org.slug}.test`, sha256(randomBytes(32)), userIds.admin],
  );

  // Step snapshot for the first completed step. Snapshots are only stored when the org has the
  // setting on, so the seed orgs have save_snapshots = true (see org_settings above).
  const { rows: stepRows } = await client.query(
    'SELECT id FROM session_steps WHERE session_id = $1 AND step_index = 0',
    [resolvedId],
  );
  await client.query(
    'INSERT INTO step_snapshots (organization_id, step_id, image) VALUES ($1, $2, $3)',
    [orgId, stepRows[0].id, PLACEHOLDER_JPEG],
  );

  // Resolvd connector configured but disabled, with no API key stored.
  await client.query(
    `INSERT INTO integration_settings (organization_id, base_url, enabled)
     VALUES ($1, $2, FALSE)`,
    [orgId, `https://resolvd.${org.slug}.test`],
  );

  // A completed idempotent request (as if user3 created the active session).
  await client.query(
    `INSERT INTO idempotency_keys
       (organization_id, user_id, key, request_hash, status, response_code, response_body)
     VALUES ($1, $2, $3, $4, 'completed', 201, $5)`,
    [orgId, userIds.user3, randomUUID(), sha256('seed-request'), JSON.stringify({ id: activeId })],
  );

  // An already-used, expired WebSocket ticket for the active session.
  await client.query(
    `INSERT INTO ws_tickets (token_hash, organization_id, user_id, session_id, expires_at, used_at)
     VALUES ($1, $2, $3, $4, NOW() - INTERVAL '4 minutes', NOW() - INTERVAL '5 minutes')`,
    [sha256(randomBytes(32)), orgId, userIds.user3, activeId],
  );
}

/**
 * Seed Acme Corp and Globex. Removes any existing data for those two orgs first.
 * @param {string} connectionString owner connection (MIGRATION_DATABASE_URL)
 * @param {{ log?: (message: string) => void }} [options]
 * @returns {Promise<Record<string, { orgId: number, userIds: Record<string, number> }>>}
 */
export async function seed(connectionString, { log = () => {} } = {}) {
  // Every seeded user shares a published password, so never seed a production database.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'seed: refusing to run with NODE_ENV=production (seeded users share a known password)',
    );
  }
  if (!connectionString) throw new Error('seed: a connection string is required');
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_COST);

  const client = new Client({ connectionString });
  await client.connect();
  /** @type {Record<string, { orgId: number, userIds: Record<string, number> }>} */
  const result = {};
  try {
    await client.query('BEGIN');
    await removeOrgs(
      client,
      SEED_ORGS.map((o) => o.slug),
    );
    for (const org of SEED_ORGS) {
      result[org.key] = await seedOrg(client, org, passwordHash);
      log(`seeded ${org.name} (id ${result[org.key].orgId})`);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
  return result;
}

// ----- CLI -----
const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  await import('../src/config/loadDotenv.js');
  try {
    await seed(process.env.MIGRATION_DATABASE_URL, { log: (message) => console.log(message) });
    console.log(`Done. Every seeded user's password is: ${SEED_PASSWORD}`);
  } catch (err) {
    console.error(`Seed failed: ${err.message}`);
    process.exitCode = 1;
  }
}
