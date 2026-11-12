# Merge plan: ScreenGuide AI → Resolvd

> **Status:** compatibility check re-run on 2026-11-11 against Resolvd's real Phase 1 code. The full
> merge plan from `SCREENGUIDE_PLAN.md` Section 4.6 is written in Phase 9: what moves, the `TicketSink`
> swap, the WebSocket attach point, the background-jobs decision, the v3 overlap and the additions
> Resolvd would gain. Until then, this file records where the two codebases agree and differ.

## Compatibility check (re-run 2026-11-11)

**What was compared.** Resolvd at `carterlafosse/resolvd` commit **`198e1f8`** (end of its Phase 1,
cloned read-only outside this repo) against ScreenGuide after the alignment commits listed below.
Resolvd now has real migrations `001`–`007`, `scripts/lib/{migrate,seed,loadEnv}.js`,
`db/seeds/users.js`, `db/setup.sql` and `src/modules/organizations/defaults.js`; those files were
compared directly. Everything Resolvd hasn't built yet (its Phase 2 HTTP foundation, Phase 3 auth)
was compared through `RESOLVD_PLAN.md`.

**Rule.** For shared conventions **Resolvd is the source of truth**. Carter's decisions A–E (below)
settled the open points from the first check.

### File-level result

| File | Result |
|---|---|
| `002_organizations.sql` | **Identical** to Resolvd's (byte for byte) |
| `003_users.sql` | **Identical** |
| `001_types_and_helpers.sql` | Identical except that ScreenGuide leaves out `ticket_status` and `ticket_priority` (no tickets table; plan 4.3) |
| `007_row_level_security.sql` | Identical except that ScreenGuide leaves out RLS, policies and grants for Resolvd-only tables (`categories`, `sla_policies`, `tickets`, `ticket_comments`, `ticket_events`) |
| `db/seeds/users.js` | **Identical** |
| `004`–`006` | Intentionally absent in ScreenGuide (Resolvd-only tables) |

`migrations.test.js` pins:
- the trigger names;
- the exact signatures and return types of `auth_find_user_by_email`, `auth_record_login_failure` and
  `create_organization`;
- `org_self` (`USING` only);
- `USAGE` on every sequence;
- `resolvd_app`'s privileges on `organizations` and `users`;
- the `users` NOT NULL columns.

**Rule from now on:** ScreenGuide's 001–003 and 007 only change when Resolvd's do, by copying them.

### What matches

- **Enum:** `user_role` = `('end_user', 'technician', 'admin')`.
- **`organizations` and `users`:** every column, type, default and `NOT NULL`, plus
  `users_email_lower_idx ON users (LOWER(email))`, `UNIQUE (organization_id, id)` and the triggers
  `organizations_updated_at` / `users_updated_at`.
- **Tenancy helpers:** `set_updated_at()`, `current_org_id()` and `app.current_org_id` via
  `set_config(..., true)`.
- **Policies:** `org_isolation` (`USING` and `WITH CHECK`), and `org_self` (`USING (id = current_org_id())`
  only).
- **`SECURITY DEFINER` functions**, all with `SET search_path = public` and `EXECUTE` revoked from
  `PUBLIC` and granted only to `resolvd_app`:
  - `auth_find_user_by_email(p_email TEXT)` returns Resolvd's 7 columns in Resolvd's order;
  - `auth_record_login_failure(INT, INT, INT) RETURNS VOID` has Resolvd's body;
  - `create_organization(TEXT, TEXT) RETURNS INT`.
- **Roles and grants:** `resolvd_owner` / `resolvd_app` only. `USAGE` on schema `public`;
  `SELECT, INSERT, UPDATE, DELETE` on `users`; `SELECT, UPDATE` on `organizations`; `USAGE` on all
  sequences.
- **Seed:** the same orgs (`acme-corp`, `globex`) and the same 12 users; `SEED_PASSWORD` from `.env`;
  `TRUNCATE … RESTART IDENTITY CASCADE`; Resolvd's checks and wording (connection string, password,
  production guard); code in `scripts/lib/`, two-line runners.
- **HTTP:**
  - `/api/health` = `SELECT 1` → `{ status: 'ok', database: 'up' }` / 503
    `{ status: 'degraded', database: 'down' }`;
  - error shape `{ error: { code, message, details? } }`;
  - any `ZodError` → 400 `VALIDATION_ERROR` with flattened `details` (`{ formErrors, fieldErrors }`);
  - `23505` → 409 `CONFLICT`, `23503` → 400 `INVALID_REFERENCE`, `22P02` → 400 `INVALID_INPUT`;
  - 404 `NOT_FOUND`; generic 500 `INTERNAL_ERROR`;
  - `env.js` exports `env` and `isProd`; `TRUST_PROXY_HOPS` (default 1);
  - `withTransaction` / `setOrg` / `withOrg`, `validate()` with `req.validatedQuery`, and the
    five-file module layout.
- **Auth spec:** the cookie, JWT payload, lockout, password rules and bcryptjs cost 12 match. The
  Phase 3 details from Resolvd's plan are recorded as binding in DECISIONS 49.
- **Platform:** Node 26, Express 5, PostgreSQL 18 locally and **`postgres:18` in CI**.

### Status of every difference from the first check

| # | Area | Resolution | Where |
|---|---|---|---|
| 1 | `org_self` `WITH CHECK` | **Fixed**: `USING` only (decision E) | 007, DECISIONS 46 |
| 2 | `auth_find_user_by_email` columns | **Fixed**: Resolvd's 7 columns in order (E) | 007, DECISIONS 46 |
| 3 | `auth_record_login_failure` | **Fixed**: added, `RETURNS VOID` (A, E) | 007, DECISIONS 46 |
| 4 | Sequence grants | **Fixed**: `USAGE ON ALL SEQUENCES` (E) | 007, DECISIONS 46 |
| 5 | Trigger names | **Fixed**: `organizations_updated_at`, `users_updated_at` (B, E) | 002/003 copied from Resolvd |
| 6 | CI image | **Fixed**: `postgres:18` | `ci.yml` |
| 7 | Setup script | **Kept** ScreenGuide's (`server/db/setup/setup.sql`, `DO` block): same effect, and it's referenced in `CLAUDE.md`. **Added** Resolvd's PowerShell-history advice to the README | README |
| 8 | `/api/health` | **Fixed**: Resolvd's contract; `/api/ready` kept as an addition (503 `degraded`) | DECISIONS 47 |
| 9 | 404 code | **Fixed**: `NOT_FOUND` | DECISIONS 47 |
| 10 | Zod errors | **Fixed**: any `ZodError` → 400 with flattened details; internal validation throws plain errors (500) | DECISIONS 47 |
| 11 | `22P02` | **Fixed**: 400 `INVALID_INPUT` | DECISIONS 47 |
| 12 | Body-parser errors | **Kept; Resolvd adopts** (C) | DECISIONS 47 |
| 13 | `AppError` helpers | **Kept; Resolvd adopts** (C) | DECISIONS 47 |
| 14–17 | Auth file, `req.user`, login details, registration | **Recorded as binding Phase 3 requirements** (not built yet) | DECISIONS 49 |
| 18 | Default categories/SLA | **Merge task** (no tables in ScreenGuide) | below |
| 19 | Seed | **Fixed**: Resolvd's `users.js`, `SEED_PASSWORD`, `TRUNCATE` | DECISIONS 48 |
| 20 | Script layout | **Fixed**: `scripts/lib/` + runners | DECISIONS 48 |
| 21 | Test environment | **Kept** ScreenGuide's (D) | below, DECISIONS 50 |
| 22 | `env.js` | **Fixed**: `isProd`, `TRUST_PROXY_HOPS`. `LOG_CLIENT_IP` comes with deployment (Phase 11). Stricter `JWT_SECRET` rule kept | DECISIONS 47 |
| 23 | Background jobs | **Decide at merge** (Section 4.6 item 4, Phase 9) | — |
| 24 | Integration wire format | **Decided**: snake_case `{ id, display_id }`, `external_ref`, idempotent on `(organization_id, source, external_ref)` | DECISIONS 51; `docs/resolvd-integration.md` in Phase 9 |

### Differences that remain on purpose

| Area | Resolvd | ScreenGuide | Why it's fine |
|---|---|---|---|
| Test setup (decision D) | `server/.env.test` loaded when `NODE_ENV=test`, via `scripts/lib/loadEnv.js` | Test URLs derived from `.env` (database name swapped to `screenguide_test`); fixed test-only secrets including `SEED_PASSWORD` in `vitest.config.js`; runners load `.env` through `src/config/loadDotenv.js` | No extra file, and tests can't touch dev data. **At merge:** ScreenGuide's tests move into Resolvd's setup (`.env.test`, its `globalSetup`); the test files themselves don't depend on how the URLs are found. |
| Setup script | `server/db/setup.sql`, `\gexec` for roles, `\quit` on a missing variable | `server/db/setup/setup.sql`, `DO` block via `set_config`, non-zero exit on a missing variable, explicit role attributes, `PUBLIC` connect revoked | Both create-if-missing and never change passwords. The roles already exist on Carter's laptop. |
| Seed data beyond orgs/users | Default categories and SLA policies | Settings, preferences, sessions, a ticket and one row in every ScreenGuide tenant table | Each app seeds its own tables. |
| `seed()` / `migrate()` extras | — | `seed()` returns the seeded ids and leaves the login table to the runner (quiet tests); `migrate()` has an advisory lock, refuses `resolvd_app`, and takes a `dir` option | Same signatures for the shared arguments. |
| `/api/ready` | — | Database + jobs | Allowed addition (plan 4.2). |
| Body-parser errors, extra `AppError` helpers | Not yet | Present | Resolvd adopts them (C). |
| `JWT_SECRET` rule | ≥ 32 characters | ≥ 96 hex characters | Stricter; each app has its own secret. |

### Merge tasks found so far

- **Default categories and SLA policies.** Backfill `DEFAULT_CATEGORIES` and `DEFAULT_SLA_POLICIES`
  (`src/modules/organizations/defaults.js` in Resolvd) for every organization created in ScreenGuide.
  Map ScreenGuide's `assist_category` to a Resolvd category for `categoryHint`: printer → Hardware,
  network → Network, email → Email, m365 → Software, account → Account Access, performance →
  Hardware, browser → Software, audio_video → Hardware, other → Other.
- **Migration numbering.** Resolvd plans `008_sla_breaches`, `009_knowledge_base`,
  `010_email_outbox` and `011_api_keys`. ScreenGuide's `100`–`112` are renumbered after whichever is
  latest at merge time. `112_pgboss` only if pg-boss is kept (item 4 below).
- **Test setup.** Move ScreenGuide's tests onto Resolvd's `.env.test` setup (see above).

### Statements in ScreenGuide's plan or instructions that are out of date

| Where | Says | Now |
|---|---|---|
| Plan 4.6 #5 | Resolvd Phase 14 (v3) plans its own text RAG assistant with **pgvector** | Resolvd's Phase 14 **is** the ScreenGuide integration (API keys + ticket intake). Its KB (Phase 11) uses PostgreSQL **full-text search**. Rewrite merge item 5 in Phase 9. |
| Plan 4.5 | Intake returns `{ id, ticketNumber, displayId }`, idempotent on `externalId` | Decision #24 / DECISIONS 51 (snake_case, `external_ref`). |
| Plan 4.7 #7 | Resolvd's CI uses `postgres:17` | `postgres:18` (both repos now). |
| Plan 8.7 | `/api/health` doesn't touch the database | Resolvd's contract (DECISIONS 47). |
| Plan header / `CLAUDE.md` | "Resolvd has not been built yet … don't look for a Resolvd repo" | Resolvd exists and has finished Phase 1. Its code is the reference for the shared files from now on. *(`CLAUDE.md` is Carter's file and hasn't been edited.)* |

## Sections to write in Phase 9 (plan Section 4.6)

1. What moves (server modules, client features, migrations 100+ renumbered).
2. `TicketSink` swap: `ResolvdHttpSink` → `ResolvdInProcessSink`.
3. WebSocket attach point in Resolvd's `server.js` and the matching shutdown steps.
4. Background jobs decision: Resolvd's `node-cron` + outbox vs pg-boss, with the recommendation.
5. Resolvd v3 overlap (rewritten for Resolvd's current Phase 14).
6. Additions Resolvd would gain.
