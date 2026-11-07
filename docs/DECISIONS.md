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

22. **2026-11-07: `users` columns copied verbatim from Section 4.1, including nullability.** As the plan
    instructs when Resolvd's file is unavailable: `name`, `email` and `password_hash` are nullable in the
    table. The app layer (Zod, Phase 3) requires them. The lower-email unique index allows only one row per
    email, and PostgreSQL treats NULLs as distinct.

23. **2026-11-07: `org_self` on `organizations` also has `WITH CHECK (id = current_org_id())`.** Section
    4.1 gives only the expression; using it for both `USING` and `WITH CHECK` matches `org_isolation` and
    stops an org row being updated to another id. New orgs are inserted only through
    `create_organization`.

24. **2026-11-07: Grant matrix for `resolvd_app`.** `organizations`: `SELECT, UPDATE`. `users`: `SELECT,
    INSERT, UPDATE` (users are deactivated, never deleted). `audit_events` and `usage_events`: `SELECT,
    INSERT` (append-only). `ws_tickets`: `SELECT, INSERT` (consumed through `consume_ws_ticket`).
    `step_snapshots`: no `UPDATE`. Session data: full CRUD. Settings, preferences, invitations and
    integration settings: no `DELETE`. Sequences: `USAGE, SELECT`. Org deletion (Phase 10) will need its
    own `SECURITY DEFINER` function, since the app can't delete from `organizations` or `users`.

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

30. **2026-11-07: Migration runner extras.** Only files named `NNN_name.sql` are applied, so the README
    is skipped. A PostgreSQL advisory lock serializes concurrent runs, such as two deploys starting at
    once. The runner refuses to run as `resolvd_app`. `migrate(connectionString, { dir })` takes a
    directory, so the rollback test can use a temporary broken migration.

31. **2026-11-07: dotenv loaded with `quiet: true`** through `src/config/loadDotenv.js`. dotenv 17+
    prints an "injected env" line on every load by default. It names no values, but it is noise in
    server logs and test output.
