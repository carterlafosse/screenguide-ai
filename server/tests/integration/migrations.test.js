// migrations.test.js: the migration runner, and structural rules every migration must follow
// (RLS on every tenant table, definer-function hardening, ownership, updated_at triggers).
// The structural checks query the catalog, so new tables and functions are covered automatically.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { listMigrationFiles, migrate } from '../../scripts/lib/migrate.js';
import { pgError, withAppClient, withOwnerClient } from '../dbHelpers.js';

describe('pg-boss schema (migration 112)', () => {
  it('matches the schema version of the installed pg-boss package', async () => {
    const pkg = JSON.parse(await readFile('node_modules/pg-boss/package.json', 'utf8'));
    const version = await withOwnerClient(
      async (c) => (await c.query('SELECT version FROM pgboss.version')).rows[0].version,
    );
    // If this fails after upgrading pg-boss: run `node scripts/generate-pgboss-migration.js`.
    expect(Number(version)).toBe(Number(pkg.pgboss.schema));
  });

  it('is owned by resolvd_owner; resolvd_app owns nothing there and cannot create objects', async () => {
    const owners = await withOwnerClient(async (c) => {
      const r = await c.query(`
        SELECT DISTINCT pg_get_userbyid(c.relowner) AS owner
        FROM pg_class c WHERE c.relnamespace = 'pgboss'::regnamespace`);
      return r.rows.map((x) => x.owner);
    });
    expect(owners).toEqual(['resolvd_owner']);
    const err = await withAppClient((c) => pgError(c.query('CREATE TABLE pgboss.sneaky (id INT)')));
    expect(err.code).toBe('42501');
  });
});

const EXPECTED_MIGRATIONS = [
  '001_types_and_helpers.sql',
  '002_organizations.sql',
  '003_users.sql',
  '007_row_level_security.sql',
  '100_enums.sql',
  '101_org_settings.sql',
  '102_user_preferences.sql',
  '103_invitations.sql',
  '104_assist_sessions.sql',
  '105_session_messages_steps.sql',
  '106_escalation_tickets.sql',
  '107_feedback_usage.sql',
  '108_audit_events.sql',
  '109_integrations.sql',
  '110_idempotency_ws_tickets.sql',
  '111_rls_and_grants.sql',
  '112_pgboss.sql',
];

describe('migration runner', () => {
  it('applied every migration in order and recorded each in schema_migrations', async () => {
    expect(await listMigrationFiles()).toEqual(EXPECTED_MIGRATIONS);
    const rows = await withOwnerClient(async (c) => {
      const r = await c.query('SELECT filename FROM schema_migrations ORDER BY filename');
      return r.rows.map((x) => x.filename);
    });
    expect(rows).toEqual(EXPECTED_MIGRATIONS);
  });

  it('applies nothing when run again', async () => {
    expect(await migrate(process.env.MIGRATION_DATABASE_URL)).toEqual([]);
  });

  it('rolls back a failing migration completely and does not record it', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sg-migrate-'));
    try {
      await writeFile(
        path.join(dir, '999_broken.sql'),
        'CREATE TABLE migrate_rollback_probe (id INT);\nSELECT * FROM table_that_does_not_exist;\n',
      );
      await expect(migrate(process.env.MIGRATION_DATABASE_URL, { dir })).rejects.toThrow(
        /999_broken\.sql failed/,
      );
      const state = await withOwnerClient(async (c) => {
        const table = await c.query("SELECT to_regclass('public.migrate_rollback_probe') AS t");
        const recorded = await c.query(
          "SELECT 1 FROM schema_migrations WHERE filename = '999_broken.sql'",
        );
        return { table: table.rows[0].t, recorded: recorded.rowCount };
      });
      expect(state).toEqual({ table: null, recorded: 0 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('refuses to run as resolvd_app', async () => {
    await expect(migrate(process.env.DATABASE_URL)).rejects.toThrow(
      /refusing to run as resolvd_app/,
    );
  });
});

describe('schema rules', () => {
  it('every table with organization_id has RLS enabled and an org_isolation policy', async () => {
    const rows = await withOwnerClient(async (c) => {
      const r = await c.query(`
        SELECT c.relname AS table_name,
               c.relrowsecurity AS rls,
               EXISTS (
                 SELECT 1 FROM pg_policies p
                 WHERE p.schemaname = 'public' AND p.tablename = c.relname
                   AND p.policyname = 'org_isolation'
                   AND p.qual = '(organization_id = current_org_id())'
                   AND p.with_check = '(organization_id = current_org_id())'
               ) AS has_policy
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'organization_id' AND NOT a.attisdropped
        WHERE c.relkind = 'r'
        ORDER BY c.relname`);
      return r.rows;
    });
    expect(rows.length).toBe(15); // users + the 14 ScreenGuide tenant tables
    for (const row of rows) {
      expect(row, row.table_name).toMatchObject({ rls: true, has_policy: true });
    }
  });

  it("organizations has RLS with Resolvd's org_self policy (USING only)", async () => {
    const row = await withOwnerClient(async (c) => {
      const r = await c.query(`
        SELECT c.relrowsecurity AS rls, p.qual, p.with_check
        FROM pg_class c
        LEFT JOIN pg_policies p ON p.tablename = c.relname AND p.policyname = 'org_self'
        WHERE c.relname = 'organizations' AND c.relnamespace = 'public'::regnamespace`);
      return r.rows[0];
    });
    expect(row).toEqual({ rls: true, qual: '(id = current_org_id())', with_check: null });
  });

  it("the shared tables use Resolvd's trigger names", async () => {
    const triggers = await withOwnerClient(async (c) => {
      const r = await c.query(`
        SELECT tgrelid::regclass::text AS table_name, tgname
        FROM pg_trigger
        WHERE NOT tgisinternal AND tgrelid IN ('organizations'::regclass, 'users'::regclass)
        ORDER BY 1`);
      return r.rows;
    });
    expect(triggers).toEqual([
      { table_name: 'organizations', tgname: 'organizations_updated_at' },
      { table_name: 'users', tgname: 'users_updated_at' },
    ]);
  });

  it("the shared definer functions have Resolvd's exact signatures and return types", async () => {
    const rows = await withOwnerClient(async (c) => {
      const r = await c.query(`
        SELECT p.proname AS name,
               pg_get_function_identity_arguments(p.oid) AS args,
               pg_get_function_result(p.oid) AS result
        FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace
          AND p.proname IN ('auth_find_user_by_email', 'auth_record_login_failure', 'create_organization')
        ORDER BY p.proname`);
      return r.rows;
    });
    expect(rows).toEqual([
      {
        name: 'auth_find_user_by_email',
        args: 'p_email text',
        result:
          'TABLE(id integer, organization_id integer, password_hash text, role user_role, ' +
          'is_active boolean, failed_login_attempts integer, locked_until timestamp with time zone)',
      },
      {
        name: 'auth_record_login_failure',
        args: 'p_user_id integer, p_max_attempts integer, p_lock_minutes integer',
        result: 'void',
      },
      { name: 'create_organization', args: 'p_name text, p_slug text', result: 'integer' },
    ]);
  });

  it('resolvd_app can use every sequence in public (Resolvd grants USAGE on all of them)', async () => {
    const missing = await withOwnerClient(async (c) => {
      const r = await c.query(`
        SELECT c.relname FROM pg_class c
        WHERE c.relkind = 'S' AND c.relnamespace = 'public'::regnamespace
          -- CASE guards the call: the planner may otherwise evaluate it on non-sequence rows.
          AND CASE WHEN c.relkind = 'S'
                   THEN NOT has_sequence_privilege('resolvd_app', c.oid, 'USAGE')
                   ELSE FALSE END`);
      return r.rows.map((x) => x.relname);
    });
    expect(missing).toEqual([]);
  });

  it('every SECURITY DEFINER function pins search_path and is executable only by resolvd_app', async () => {
    const rows = await withOwnerClient(async (c) => {
      const r = await c.query(`
        SELECT p.proname AS name,
               p.proconfig AS config,
               has_function_privilege('resolvd_app', p.oid, 'EXECUTE') AS app_can_execute,
               EXISTS (
                 SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
                 WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
               ) AS public_can_execute
        FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
        ORDER BY p.proname`);
      return r.rows;
    });
    expect(rows.map((r) => r.name)).toEqual([
      'accept_invitation',
      'auth_find_user_by_email',
      'auth_record_login_failure',
      'consume_ws_ticket',
      'create_organization',
      'purge_expired_sessions',
      'purge_expired_ws_tickets',
      'purge_idempotency_keys',
    ]);
    for (const row of rows) {
      expect(row.config, row.name).toEqual(['search_path=public']);
      expect(row.app_can_execute, row.name).toBe(true);
      expect(row.public_can_execute, row.name).toBe(false);
    }
  });

  it('resolvd_app owns nothing and is not a superuser or RLS-bypassing role', async () => {
    const result = await withOwnerClient(async (c) => {
      const owned = await c.query(`
        SELECT c.relname FROM pg_class c
        WHERE c.relnamespace = 'public'::regnamespace AND pg_get_userbyid(c.relowner) = 'resolvd_app'
        UNION ALL
        SELECT p.proname FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace AND pg_get_userbyid(p.proowner) = 'resolvd_app'`);
      const role = await c.query(
        "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'resolvd_app'",
      );
      return { owned: owned.rows, role: role.rows[0] };
    });
    expect(result.owned).toEqual([]);
    expect(result.role).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it('users: name, email and password_hash are NOT NULL (shared shape Resolvd copies)', async () => {
    const columns = await withOwnerClient(async (c) => {
      const r = await c.query(`
        SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users'
          AND column_name IN ('name', 'email', 'password_hash')`);
      return Object.fromEntries(r.rows.map((x) => [x.column_name, x.is_nullable]));
    });
    expect(columns).toEqual({ name: 'NO', email: 'NO', password_hash: 'NO' });
  });

  it("resolvd_app has exactly Resolvd's privileges on the shared tables", async () => {
    const privileges = await withOwnerClient(async (c) => {
      const r = await c.query(`
        SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privileges
        FROM information_schema.role_table_grants
        WHERE grantee = 'resolvd_app' AND table_name IN ('organizations', 'users')
        GROUP BY table_name`);
      return Object.fromEntries(r.rows.map((x) => [x.table_name, x.privileges]));
    });
    expect(privileges).toEqual({
      organizations: 'SELECT,UPDATE',
      users: 'DELETE,INSERT,SELECT,UPDATE',
    });
  });

  it('every table with updated_at has the set_updated_at trigger', async () => {
    const missing = await withOwnerClient(async (c) => {
      const r = await c.query(`
        SELECT c.relname
        FROM pg_class c
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'updated_at' AND NOT a.attisdropped
        WHERE c.relkind = 'r' AND c.relnamespace = 'public'::regnamespace
          AND NOT EXISTS (
            SELECT 1 FROM pg_trigger t
            WHERE t.tgrelid = c.oid AND t.tgfoid = 'set_updated_at'::regproc
          )`);
      return r.rows.map((x) => x.relname);
    });
    expect(missing).toEqual([]);
  });
});
