# Progress

## Phase 0: Repo and tooling (GitHub issue #1), done 2026-11-06

### Built
- Root: `client/`, `server/`, `docs/`, `.gitignore`, `.gitattributes` (`* text=auto eol=lf`),
  `.editorconfig`, `.nvmrc` (26), shared `.prettierrc.json`, `README.md` placeholder (local setup, role-name
  explanation, running alongside Resolvd), `CLAUDE.md` (already present).
- Docs: `DECISIONS.md` (Section 4.7 starting entries + Phase 0 decisions), `PROGRESS.md`,
  `architecture.md` (started).
- `server/db/setup/setup.sql`: creates `resolvd_owner`/`resolvd_app` only if missing (never changes an
  existing password), `screenguide_dev`/`screenguide_test` owned by `resolvd_owner` only if missing
  (`\gexec`), passwords via psql variables, locks database access to the two roles. Safe to rerun.
- Server package (ES modules, Node ≥ 26): exact pinned Section 4.1 packages + Section 4.2 additions
  (`ws`, `pg-boss`, `@anthropic-ai/sdk`, `resend`). Scripts `dev`, `start`, `migrate`, `seed`,
  `seed:demo`, `kb:build`, `test`, `lint` (+ `format`, `test:watch`). Placeholder `createApp()` with
  `GET /api/health`; stub scripts for later phases; `db/migrations/README.md` explaining the 004–006 gap;
  ESLint + Prettier; Vitest + Supertest smoke test; `.env.example`.
- Client: Vite 8 + React 19, Mantine 9, TanStack Query 5, React Router 8 (data mode), Zustand. Dev server
  on `127.0.0.1:5174`, `/api` and `/ws` proxied to `127.0.0.1:4001`. Placeholder page showing the API
  status through the proxy; ESLint + Prettier; Vitest + Testing Library with Mantine's jsdom shims;
  `.env.example`.
- CI (`.github/workflows/ci.yml`): server job with a `postgres:17` service, runs `setup.sql` twice
  (proves it's idempotent), checks both roles can connect, then `npm ci`, lint, test. Client job: `npm ci`,
  lint, test, build.

### Verified locally (Windows 11, Node 26.13.0, npm 11.20.0)
- `server`: `npm run lint` clean, `npm test` 1/1 passing, `npm run dev` serves
  `http://127.0.0.1:4001/api/health` → `{"status":"ok"}`.
- `client`: `npm run lint` clean, `npm test` 2/2 passing, `npm run build` succeeds, `npm run dev` serves
  `http://127.0.0.1:5174` and `/api/health` through the proxy → `{"status":"ok"}`.
- `setup.sql` tested against a throwaway PostgreSQL 18 cluster (scram auth): first run creates everything;
  second run with *different* passwords leaves the roles unchanged (original passwords still work, new ones
  are rejected); missing variable or a short password exits with code 3; both roles connect, and the owner
  can create tables. Not run against Carter's real cluster (needs the `postgres` password).
- CI: not run yet (nothing pushed).

### Deviations
See `DECISIONS.md` entries 10–20 (Node 26, `set_config` hand-off in `setup.sql`, placeholder server and
stub scripts, hand-written client ESLint config, React Router data mode, deferred client packages,
blocked `@scarf/scarf` script, dev-only audit findings, `.nvmrc`/`.editorconfig`).

### Known issues
- `npm audit`: 4 moderate, dev-only (ESLint 10 → `minimatch`), no fix without downgrading ESLint. No
  high/critical. Production dependencies (`npm audit --omit=dev`): 0 in both the client and the
  server.
- Local PostgreSQL is 18 (from `psql --version`); CI uses 17 to match Resolvd. Nothing in Phase 0 depends
  on the difference; keep migrations to features available in 17.

### Measurements
- None relevant yet (latency and cost tracking start in Phases 6–7). Client production bundle: 440 kB JS
  (137 kB gzip), 250 kB CSS (36 kB gzip), mostly Mantine styles.

## Phase 1: Database, migrations and RLS (GitHub issue #2), done 2026-11-07

### Built
- `server/scripts/migrate.js`: exports `migrate(connectionString, { dir, log })`. Each file runs in one
  transaction (`BEGIN` → SQL → insert into `schema_migrations` → `COMMIT`, `ROLLBACK` on error), under an
  advisory lock, and the runner refuses to run as `resolvd_app`. `npm run migrate` uses
  `MIGRATION_DATABASE_URL`.
- Migrations `001`–`003`, `007` (shared shape with Resolvd) and `100`–`111` (Section 15.2): 16 tenant
  tables plus `organizations`; RLS `org_isolation` on every tenant table and `org_self` on
  `organizations`; composite FKs; `set_updated_at` triggers; seven `SECURITY DEFINER` functions
  (`auth_find_user_by_email`, `create_organization`, `accept_invitation`, `consume_ws_ticket`, three
  purge functions), each with `SET search_path = public` and `EXECUTE` granted only to `resolvd_app`.
- `server/db/seeds/users.js` and `scripts/seed.js`: Acme Corp and Globex, each with 1 admin, 2
  technicians and 3 end users with departments; org settings; preferences; 3 sessions (resolved with
  steps, feedback and usage; escalated with a ticket; active); an audit row; and at least one row in
  every other tenant table (invitation, step snapshot, integration settings, idempotency key, ws
  ticket). Rerunnable; refuses to run when `NODE_ENV=production`.
- Tests (`tests/globalSetup.js` resets, migrates and seeds `screenguide_test`):
  - `migrations.test.js`: order and recording, rerun is a no-op, a failing file rolls back completely,
    refuses the app role, and catalog-driven rules (RLS + policy on every table with `organization_id`,
    definer-function hardening, app owns nothing, `updated_at` triggers, `users` NOT NULL columns,
    `resolvd_app`'s exact privileges on `organizations` and `users`).
  - `rls.test.js`: the Phase 1 acceptance check, plus for every tenant table: a guard that both orgs
    have seeded rows, 0 rows with no org set, and each org seeing its own rows but never the other's.
    Also WITH CHECK, cross-org update/delete, composite FK, the append-only audit log, and each definer
    function's behaviour.
  - `tests/unit/seed.test.js`: the production guard (never connects).
- `src/config/loadDotenv.js` (quiet dotenv), `docs/rls-demo.sql`, `docs/architecture.md` Database
  section, README setup steps for migrate/seed.

### Verified locally (Windows 11, Node 26.13.0, PostgreSQL 18.6)
- `server`: `npm run lint` clean; `npm test`: **71 passed** (4 files), about 8 s including reset,
  migrate and seed.
- `client`: unchanged since Phase 0 (lint clean, 2 tests passing).
- `screenguide_dev` was reset (public schema dropped and recreated as the owner) after the pre-push
  fixes, then `npm run migrate` applied 16 files and `npm run seed` created Acme (id 1) and Globex
  (id 2), with rows for both orgs in all 15 tenant tables. `NODE_ENV=production npm run seed` exits 1.
- Acceptance, via `docs/rls-demo.sql` as `resolvd_app` on `screenguide_dev`: no org set → 0 rows; inside
  a transaction with Acme's org set → Acme's 3 sessions only; after `COMMIT` → 0 rows again. Also asserted
  by `rls.test.js`.
- Mutation checks: removing `assist_sessions` from the RLS list in `111` made 9 tests fail (acceptance and
  catalog checks). After seeding every table, removing `invitations` (previously empty) made its
  per-table checks fail too, not just the catalog check. Restored both times; all pass.
- **Screenshot still needed:** `docs/screenshots/phase1-rls.png` (Carter to capture `rls-demo.sql` output).
- CI: not run yet in Phase 1 (nothing pushed). CI uses PostgreSQL 17; everything used here
  (`ON DELETE SET NULL (col)`, `make_interval`, `acldefault`) exists in 17.

### Deviations
See `DECISIONS.md` entries 21–32: assumed `organizations.name`/`slug` types, `users` name/email/
password_hash NOT NULL (Resolvd must copy), `org_self` WITH CHECK, grant matrix (`users` gets DELETE to
match Resolvd's 007), definer function placement and purge scope, extra constraints and indexes,
`usage_events` SET NULL, test URLs derived from `.env`, seed details (every tenant table seeded;
seed orgs have snapshots on), runner extras, quiet dotenv, production guard on the seed.

### Known issues
- `organizations.name`/`slug` types are an assumption that Resolvd must match (entry 21). The `users`
  NOT NULL columns are a shared-shape decision Resolvd must copy (entry 22).
- `npm audit`: unchanged (4 moderate, dev-only).

### Measurements
- Server test run: ~8 s for 71 tests, including a full reset, migrate and seed. Seed alone: ~0.7 s per run
  (one bcryptjs cost-12 hash).
