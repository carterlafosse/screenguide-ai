# Decisions

Log of choices made where the plan (`SCREENGUIDE_PLAN.md`) was ambiguous, conflicted with current library
docs, or could not be followed exactly. Newest entries at the bottom of each section.

Format: **date: decision**. Reason. Alternatives.

---

## Starting entries: conflicts between earlier plan drafts and Resolvd (plan Section 4.7)

All resolved in Resolvd's favour. Section 4.1 is the source of truth.

1. **2026-11-06: No type checking.** An earlier draft added JSDoc + `checkJs` + `tsc` (a TypeScript dev
   dependency and `typecheck` scripts). Removed: plain JavaScript ES modules only; JSDoc is documentation
   only.
2. **2026-11-06: Role names are `resolvd_owner` / `resolvd_app`** (not `screenguide_owner` /
   `screenguide_app`). Roles are cluster-wide in PostgreSQL, so `server/db/setup/setup.sql` creates them only
   if missing and never changes their passwords. Whichever project is set up first on a machine creates them
   and the other reuses them. ScreenGuide is being built first, on Carter's laptop. The README explains why a
   ScreenGuide repo uses `resolvd_*` names: the two apps are designed to share one database after the merge.
3. **2026-11-06: Users table identical to Resolvd.** The earlier draft was missing `department` and
   `email_notifications` and didn't fix the column types or the `'end_user'` default. Now identical (Section
   4.1).
4. **2026-11-06: RLS migration is `007_row_level_security.sql`** (not `009_rls_core.sql`), matching Resolvd's
   numbering.
5. **2026-11-06: Cookie `resolvd_token`, JWT payload `{ sub, org }` only.** Local-dev side effect: browsers
   don't separate cookies by port, so running Resolvd and ScreenGuide on `localhost` at the same time would
   log you out of one when you log into the other. Workaround: ScreenGuide at `http://127.0.0.1:5174`,
   Resolvd at `http://localhost:5173`. Documented in the README.
6. **2026-11-06: Locally installed PostgreSQL, no Docker.** Like Resolvd (EDB installer + pgAdmin on
   Windows), with a SQL setup script run as the `postgres` superuser.
7. **2026-11-06: CI database image `postgres:17`**, matching Resolvd's CI.
8. **2026-11-06: Password rules and lockout exactly as Resolvd**: 10–72 chars, a letter and a number,
   bcryptjs cost 12, 5 attempts → 15-minute lock, counter reset to 0 when the lock is set.
9. **2026-11-06: Job queue kept as an allowed addition** (`pg-boss`, Section 4.2), with the post-merge
   recommendation to be written in `docs/merge-plan.md` (Phase 9).

---

## Phase 0: repo and tooling

10. **2026-11-06: Node.js 26 LTS** (`.nvmrc` = `26`, `engines.node >= 26`, CI reads `.nvmrc`).
    Reason: the plan says "Node.js LTS"; on the build date Node 26 is the Active LTS (26.13.0), and the
    current versions of several pinned packages need a newer Node than the 22.14.0 that was installed
    (react-router 8 needs ≥ 22.22, jsdom 31 ≥ 22.22.2, pg-boss 12 ≥ 22.12). Carter chose to upgrade to 26.
    Alternatives: Node 24 (Maintenance LTS), or stay on 22 and pin older majors.

11. **2026-11-06: `setup.sql` passes the passwords into the `DO` block via `set_config`.**
    Reason: the plan asks for `DO $$ ... IF NOT EXISTS (SELECT FROM pg_roles ...)`, but psql does not
    substitute `:'owner_pw'` variables inside a dollar-quoted `DO` body. The script copies the variables into
    session-local settings (`screenguide_setup.*`), the `DO` block reads them with `current_setting()` and
    builds `CREATE ROLE ... PASSWORD %L` with `format()`, and the settings are cleared afterwards. Databases
    use `SELECT ... WHERE NOT EXISTS ... \gexec` because `CREATE DATABASE` can't run in a `DO` block.
    The script also: stops on missing variables or new passwords shorter than 12 characters (non-zero exit);
    creates both roles with explicit `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`; creates
    the databases with `ENCODING 'UTF8' TEMPLATE template0` (Windows clusters can default to WIN1252
    templates); and revokes `PUBLIC` access to both databases, granting `CONNECT, TEMPORARY` to
    `resolvd_app` (the owner already has full rights).
    Alternatives: `\gexec` for the roles too (works, but strays from the plan's `DO` pattern); hardcoded
    passwords (rejected: secrets in git).

12. **2026-11-06: Minimal placeholder server in Phase 0.** `src/app.js` exports `createApp()` with only
    `GET /api/health`, and `src/server.js` listens on `127.0.0.1:4001` (`0.0.0.0` when
    `NODE_ENV=production`) with a basic SIGTERM/SIGINT close. Reason: Phase 0's acceptance is "`npm run dev`
    works in both", which needs something to run, and the client placeholder uses it to prove the `/api`
    proxy. Phase 2 replaces this with `env.js`, the full middleware stack and graceful shutdown.

13. **2026-11-06: `migrate`, `seed`, `seed:demo` and `kb:build` are stubs** that print "not implemented
    yet (Phase N)" and exit with code 1. Reason: Phase 0 requires the npm scripts to exist; the real
    scripts belong to Phases 1 and 9. Exiting 1 means nobody mistakes a stub for a successful run.

14. **2026-11-06: ESLint flat config set up by hand for the client.** Reason: `create-vite` 9 now scaffolds
    React projects with oxlint instead of ESLint, but the plan specifies ESLint + Prettier. The client uses
    `@eslint/js` recommended + `eslint-plugin-react-hooks` (`configs.flat.recommended`) +
    `eslint-plugin-react-refresh` (`reactRefresh.configs.vite()`) + `eslint-config-prettier`. `npm run lint`
    runs `eslint . && prettier --check .` in both packages (`&&` works in cmd.exe, PowerShell-launched npm
    and bash). One shared `.prettierrc.json` lives at the repo root.

15. **2026-11-06: React Router 8 in data mode** (`createBrowserRouter` from `react-router`, `RouterProvider`
    from `react-router/dom`), per the installation guide bundled with react-router 8.5.1. The plan says
    "React Router" without a mode; data mode is the documented SPA setup and supports the guards planned for
    Phase 4. Alternative: declarative `<BrowserRouter>`.

16. **2026-11-06: Client packages installed in Phase 0 are the ones Phase 0 needs**, plus those fixed by
    Section 6.2: `react`, `react-dom`, `@mantine/core`, `@mantine/hooks`, `@mantine/form`,
    `@mantine/notifications`, `@tabler/icons-react`, `@tanstack/react-query`, `react-router`, `zustand`;
    dev: `vite`, `@vitejs/plugin-react`, PostCSS + Mantine preset, Vitest, jsdom, Testing Library,
    ESLint, Prettier. `@mantine/dates` (+ `dayjs`) and `@mantine/charts` (+ `recharts`) are deferred to
    the phases that use them (Phase 9 dashboard); `@playwright/test` and its browsers are deferred to
    Phase 6 as instructed. No server SDKs for Deepgram/ElevenLabs (the plan relays their WebSocket/HTTP
    APIs directly; revisited in Phase 7). Zod 4's built-in `z.toJSONSchema()` makes `zod-to-json-schema`
    unnecessary (Section 6.1 allows either; confirmed in Phase 6).

17. **2026-11-06: Server dev-only packages beyond Section 4.1's list:** `vitest`, `supertest` (Section 4.1
    test stack), `eslint`, `@eslint/js`, `globals`, `eslint-config-prettier`, `prettier` (Phase 0
    tooling) and `pino-pretty` (Section 6.1, dev logs). All are `devDependencies`; runtime dependencies are
    exactly Section 4.1 + Section 4.2.

18. **2026-11-06: `@scarf/scarf` install script left blocked.** `swagger-ui-express` → `swagger-ui-dist`
    pulls in `@scarf/scarf`, whose postinstall sends install analytics. npm 11 does not run install scripts
    that aren't allow-listed, and it is deliberately not approved (privacy; nothing depends on it).

19. **2026-11-06: Known `npm audit` findings (moderate, dev-only).** 4 moderate advisories in both
    packages, all from `minimatch` via ESLint 10's `@eslint/config-array` (GHSA-g3hv-75wg-m249). The only
    automatic fix downgrades to ESLint 9. Accepted for now: dev tooling only, never shipped or run on
    untrusted globs. `npm audit --omit=dev` is clean in the client, and the server is clean too. Re-check before deploy (Phase 10 needs
    no high/critical).

20. **2026-11-06: Repo extras `.nvmrc` and `.editorconfig`.** Not in the plan's file tree; added so the
    Node version and LF/2-space formatting are consistent across editors and CI. No new packages.

---

## Phase 1: database, migrations and RLS

21. **2026-11-07: `organizations.name VARCHAR(100) NOT NULL`, `slug VARCHAR(50) NOT NULL UNIQUE` (assumed).**
    Section 4.1 leaves these types to "exactly as in Resolvd's 002_organizations.sql", and Resolvd hasn't
    been written yet. Chose lengths matching `users.name` and a typical URL slug. **Resolvd's 002 must use
    the same definition**, or this migration changes to match before the merge.
    Alternatives: `TEXT`; `VARCHAR(255)`.

22. **2026-11-07: `users.name`, `users.email` and `users.password_hash` are `NOT NULL`. Resolvd must copy
    this.** Section 4.1 lists them without `NOT NULL` and says to take constraints from Resolvd's files.
    Resolvd isn't built yet, so ScreenGuide defines the shared shape, and Carter decided all three are
    required: every user has a name, a login email and a password (accounts are created by an admin,
    registration or an accepted invitation, which all set them). `NOT NULL` on `email` also closes a gap:
    the lower-email unique index treats NULLs as distinct, so several users with no email could have
    existed. **Resolvd's `003_users.sql` must use exactly the same column definitions.** A test pins the
    nullability of these columns. (First draft: nullable, copied verbatim; changed before Phase 1 was
    pushed.)

23. **2026-11-07: `org_self` on `organizations` also has `WITH CHECK (id = current_org_id())`.** Section
    4.1 gives only the expression; using it for both `USING` and `WITH CHECK` matches `org_isolation` and
    stops an org row being updated to another id. New orgs are inserted only through
    `create_organization`.

24. **2026-11-07: Grant matrix for `resolvd_app`.** Shared tables match **Resolvd's 007 exactly**:
    `organizations`: `SELECT, UPDATE`; `users`: `SELECT, INSERT, UPDATE, DELETE` (corrected 2026-11-07:
    the first draft left out `DELETE`, which didn't match Resolvd; a test now pins both). ScreenGuide
    tables: `audit_events` and `usage_events`: `SELECT, INSERT` (append-only). `ws_tickets`: `SELECT,
    INSERT` (consumed through `consume_ws_ticket`). `step_snapshots`: no `UPDATE`. Session data: full
    CRUD. Settings, preferences, invitations and integration settings: no `DELETE`. Sequences: `USAGE,
    SELECT`. Users are still deactivated rather than deleted in normal use (Section 4.1 / Phase 3). Org
    deletion (Phase 10) will need its own `SECURITY DEFINER` function, since the app can't delete from
    `organizations`.

25. **2026-11-07: Where the definer functions live.** `accept_invitation` is in `103` and
    `consume_ws_ticket` is in `110`, next to their tables, as the plan's per-migration descriptions say.
    The cross-org purge functions are in `111`: `purge_expired_sessions()`,
    `purge_idempotency_keys(max_age)` and `purge_expired_ws_tickets()`. Retention deletes finished
    sessions older than the org's `retention_days`, and everything attached cascades with them.
    `audit_events` and `usage_events` are not purged by retention: they hold no transcript content, and
    the audit log is meant to be permanent. Revisit in Phase 10 if needed.
    `accept_invitation` returns `(user_id, organization_id, role)` and raises `INVITATION_INVALID`
    (SQLSTATE `P0001`) for an unknown, used, revoked or expired token. A duplicate email surfaces as the
    normal `23505`.

26. **2026-11-07: Constraints and indexes beyond the plan's column lists.** CHECKs: `speech_rate` 0.8–1.2
    (Section 11.2), `input_mode` in `handsfree`/`push_to_talk`/`typing` (Section 5.3), `step_snapshots`
    ≤ 80 KB (Section 14.2), `suggested_priority` in `low`/`medium`/`high`/`critical`, and
    `idempotency_keys.status` in `in_progress`/`completed`. `NOT NULL` on required content (message
    content, step title/instruction, ticket title/summary). `UNIQUE (organization_id, id)` on every table
    another table references (`invitations`, `session_steps`, `escalation_tickets`). Extra
    `organization_id` indexes on child tables, so RLS-filtered scans stay indexed.

27. **2026-11-07: `usage_events` → session FK is `ON DELETE SET NULL (session_id)`.** Usage and cost
    history outlive a deleted session. The column-list form (PostgreSQL 15+) clears only `session_id`,
    not `organization_id`. Works on the local 18 and the CI 17.

28. **2026-11-07: Tests always use `screenguide_test`, with URLs derived from `.env`.** `vitest.config.js`
    takes `DATABASE_URL` / `MIGRATION_DATABASE_URL` and swaps the database name. That way `npm test` with a
    dev `.env` can't touch dev data, and no extra env variables are needed. `globalSetup` drops and
    recreates the `public` schema, but only in a database whose name ends in `_test`, then migrates and
    seeds. Alternative: separate `TEST_DATABASE_URL` variables (more setup, easy to point at dev by
    mistake).

29. **2026-11-07: Seed details.** One shared dev password (`ScreenGuide123`, exported from
    `db/seeds/users.js`), hashed once per run with bcryptjs cost 12 and reused for all 12 users, which
    keeps the seed around 1.5 s. Emails use the reserved `.test` domain. The seed runs as the owner in one
    transaction and can be rerun: it deletes Acme's and Globex's rows first and never touches other orgs.
    **Every tenant table gets at least one row for each org**, so the per-table RLS checks in
    `rls.test.js` test real data, and a guard test fails if any table is ever left empty. The previously
    empty tables get:
    - `invitations`: an open invite (random token, only the hash stored);
    - `step_snapshots`: a synthetic 1×1 JPEG, not a real screen;
    - `integration_settings`: a disabled Resolvd connector with no API key;
    - `idempotency_keys`: a completed request;
    - `ws_tickets`: an already-used, expired ticket.

    Because snapshots are only stored when an org turns the setting on (privacy rule), both seed orgs
    have `org_settings.save_snapshots = true`. The column default stays `false` for real orgs.

30. **2026-11-07: Migration runner extras.** Only files named `NNN_name.sql` are applied, so the README
    is skipped. A PostgreSQL advisory lock serializes concurrent runs, such as two deploys starting at
    once. The runner refuses to run as `resolvd_app`. `migrate(connectionString, { dir })` takes a
    directory, so the rollback test can use a temporary broken migration.

31. **2026-11-07: dotenv loaded with `quiet: true`** through `src/config/loadDotenv.js`. dotenv 17+
    prints an "injected env" line on every load by default. It names no values, but it is noise in
    server logs and test output.

32. **2026-11-07: `seed()` refuses to run when `NODE_ENV=production`.** Every Acme/Globex user shares the
    published password `ScreenGuide123`, so seeding a production database would create known-password
    accounts. The check is inside `seed()`, before hashing or connecting, so it covers both
    `npm run seed` (which exits with code 1) and any code that imports it; a unit test asserts it never
    connects. The demo seed (`seed:demo`, Phase 9) is a separate script for production's demo org and
    gets its own rules.

33. **2026-11-07: Two more shared-shape details in `007_row_level_security.sql` that Resolvd must
    copy.** Section 4.1 doesn't spell these out, and ScreenGuide implements the shared migrations first:
    - **`org_self` has `WITH CHECK (id = current_org_id())`** as well as `USING`, so an org row can't be
      updated to another id (reasoning in entry 23).
    - **`auth_find_user_by_email(p_email)` also returns `name` and `email`.** The full column list is
      `id, organization_id, name, email, password_hash, role, is_active, failed_login_attempts,
      locked_until`. Login needs `name` and `email` to build the response without a second query.

    Resolvd's 007 must define both exactly the same way, so that the shared migrations and the auth code
    that calls the function behave identically in both apps.

---

## Phase 2: Express foundation

34. **2026-11-07: pg-boss schema installed by migration `112_pgboss.sql`, generated from pg-boss's own
    construction plans.** Plan Section 8.2 asks for the schema to be created by `resolvd_owner` in a
    numbered migration, with pg-boss running as `resolvd_app` and its automatic migrations off. I checked
    the installed pg-boss 12.38.1 (schema version 46):
    - `getConstructionPlans('pgboss')` returns the install SQL. It wraps itself in `BEGIN;`/`COMMIT;`,
      which would end the runner's transaction early, so `scripts/generate-pgboss-migration.js` removes
      that outer pair. The plan's `SET LOCAL` statements and transaction-scoped advisory lock still work
      inside the runner's transaction. The script then appends grants for `resolvd_app`: `USAGE` on the
      schema, `SELECT, INSERT, UPDATE, DELETE` on its tables, sequences, and `EXECUTE` on its functions.
    - At runtime the app uses `new PgBoss({ migrate: false, createSchema: false, reindex: false })`.
      With `migrate: false`, `start()` only checks the installed version ("requires migrations" if it
      doesn't match). `reindex` is off because `REINDEX` needs table ownership.
    - Queues use pg-boss's default `partition: false`, so `create_queue()` is a plain `INSERT` the app
      role can do. Partitioned queues would run `CREATE TABLE` and need the owner.
    - Verified as `resolvd_app`: start, create a queue, work, cron schedule, `supervise()` maintenance
      and graceful stop, with no errors or warnings. The app role can't create objects in `pgboss`
      (tested).
    - **Upgrading pg-boss:** run `node scripts/generate-pgboss-migration.js`. It writes the next
      numbered `NNN_pgboss_vXX.sql` from `getMigrationPlans()`, starting at the version recorded in the
      last pgboss migration. A test fails if the installed schema doesn't match the package.

    Alternative rejected: running pg-boss once with the owner URL inside `migrate.js`. It works, but the
    SQL wouldn't be reviewable in git and it would bypass `schema_migrations`.

35. **2026-11-07: Jobs are enqueued inside the caller's transaction.** `jobs.send(name, data, { client })`
    passes pg-boss a `db` adapter that runs its `INSERT` on the `withOrg` client, so a job exists only
    if the data change commits (outbox guarantee, plan Section 8.2). Tested both ways. Every payload must
    carry `{ orgId, requestId }` (Zod envelope, checked on send and again in the worker). Workers get a
    child logger bound to queue, job id, org id and request id.

36. **2026-11-07: Helper signatures match Section 4.1 exactly.** `withOrg(orgId, work)`,
    `withTransaction(work)` and `setOrg(client, orgId)` use a module-level pool (`src/db/pool.js`,
    connected as `resolvd_app`). `setOrg` rejects anything that isn't a positive integer.
    `createApp({ pool, jobs, logger, mountRoutes })` takes optional dependencies: tests inject a dead
    pool (to simulate Postgres being down), fake or real jobs, a capturing logger, and test-only routes.

37. **2026-11-07: helmet's default CSP is kept, and `/api/docs` is mounted after helmet.** Plan Section
    14.4 says to mount docs before helmet or configure the CSP. Checked: swagger-ui-express 5 loads its
    scripts from files (no inline script), and its inline `<style>` is allowed by helmet's default
    `style-src 'self' https: 'unsafe-inline'`. So no CSP exception is needed. The OpenAPI document is
    also served as JSON at `/api/docs/openapi.json`.

38. **2026-11-07: Error codes (ScreenGuide defines them first; Resolvd should copy).** Section 4.1 fixes
    the error shape and the 23505 → 409 and 23503 → 400 mapping, but not the code strings:
    - `CONFLICT` (23505), `INVALID_REFERENCE` (23503), `VALIDATION_ERROR` (with
      `details: [{ location, path, message }]`);
    - `INVALID_JSON` (400), `PAYLOAD_TOO_LARGE` (413), `ROUTE_NOT_FOUND` / `NOT_FOUND` (404);
    - `UNAUTHORIZED`, `FORBIDDEN`, `RATE_LIMITED` (429), `INTERNAL_ERROR` (500, generic message, logged
      with the request id).

    Rate-limit rejections go through the same error handler, so they use the same shape.

39. **2026-11-07: Idempotency details** (plan Section 8.4 left these open):
    - The request hash is SHA-256 of the method, the full path with its query string, and the body as
      JSON with keys sorted, so key order doesn't matter.
    - Keys are compared in lower case and scoped to `(org, user)`.
    - 2xx and 4xx responses are stored and replayed, with the header `Idempotent-Replayed: true`.
    - 5xx responses, and handlers that finish without `res.json`, release the key so a retry runs again.
    - An `in_progress` key older than 5 minutes is treated as abandoned (for example after a crash) and
      reclaimed, instead of returning 409 until the hourly purge.
    - The key is claimed in its own short transaction before the handler runs, so a concurrent duplicate
      sees it as in progress.

40. **2026-11-07: Rate limiting uses express-rate-limit's in-memory store, so limits are per instance.**
    This is fine on one Render instance. To scale horizontally, plug in a shared store through the
    `store` option: a Postgres-backed store (a published one, or a small custom store on a table, the
    natural choice since there's no Redis) or Redis. All four limiters are built in
    `src/middleware/rateLimits.js`. The general limiter (300/min per IP on `/api`) is active now. Login,
    register and ws-ticket limiters are defined and get attached in Phases 3 and 5. `trust proxy` is
    `1` (one proxy hop on Render), so `req.ip` is the client's IP.

41. **2026-11-07: `env.js` rules and one new variable.** Validation: `JWT_SECRET` must be at least 96
    hex characters (48 bytes, as `.env.example` says); `ENCRYPTION_KEY` must decode to exactly 32 bytes;
    `DATABASE_URL` must be a `postgres://` URL; `PUBLIC_WS_URL` must be `ws://`/`wss://`; empty values
    count as unset. Errors list variable names, never values. Provider keys stay optional; production
    requirements get added with each feature. **`LOG_LEVEL` is new** (not in Section 20; default
    `info`, `silent` in tests) and is in `.env.example`.

42. **2026-11-07: Tests use fixed test-only secrets.** `vitest.config.js` sets `JWT_SECRET`,
    `ENCRYPTION_KEY`, `CLIENT_ORIGIN`, `PUBLIC_WS_URL` and blank provider keys, and takes only the
    database credentials from `.env`. Tests never see real secrets, and CI needs no extra variables.

43. **2026-11-07: Startup and shutdown.** The server listens on `127.0.0.1` in development and
    `0.0.0.0` in production (Render), with no `HOST` variable. If pg-boss can't start (database not
    reachable yet), the API keeps serving, `/api/ready` returns 503, and it retries every 15 s instead
    of crash-looping. Shutdown lives in `src/shutdown.js` so it can be unit-tested (Windows can't send a
    real SIGTERM to test it): close HTTP → stop jobs (10 s grace) → `pool.end()` → exit 0, with a forced
    exit 1 after 20 s. Phase 5 inserts the WebSocket step.

44. **2026-11-07: Log redaction is broader than Section 14.4's list.** As well as cookie, authorization,
    `*.password`, `*.frame` and `*.apiKey`, it also redacts `set-cookie`, `*.passwordHash`, `*.token`,
    `*.ticket`, `*.secret`, `*.audio`, `*.transcript` and `*.content`, the field that holds message text.
    Tests check that passwords, frames, API keys and cookies never appear in log output.

45. **2026-11-07: `/api/ready` checks.** The database check is `pool.query('SELECT 1')`. It's not a
    tenant query (it reads no table), so it doesn't need `withOrg`. Jobs are checked by a pg-boss queue
    lookup. Each check times out after 2 s, and either one being down returns 503 with
    `{ status: 'unavailable', database, jobs }`.
