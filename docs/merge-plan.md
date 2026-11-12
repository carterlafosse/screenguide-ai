# Merge plan: ScreenGuide AI → Resolvd

> **Status:** started 2026-11-11 with the compatibility check below. The full merge plan from
> `SCREENGUIDE_PLAN.md` Section 4.6 is written in Phase 9: what moves, the `TicketSink` swap, the
> WebSocket attach point, the background-jobs decision, the v3 overlap and the additions Resolvd would
> gain. Until then, this file records where the two codebases agree and differ.

## Compatibility check: 2026-11-11

**What was compared.** Resolvd at `carterlafosse/resolvd` commit `f4ffdf5` (cloned read-only outside
this repo). Resolvd has only finished Phase 0, so it has **no migrations, no `src/` code and no seed
yet** (only `.gitkeep` placeholders). It was therefore compared through its authoritative spec,
`RESOLVD_PLAN.md`, plus its `CLAUDE.md`, `server/package.json`, `server/.env.example` and lint/format
config. ScreenGuide was compared through its actual code at the end of Phase 2.

**Rule applied.** For shared conventions **Resolvd is the source of truth**. Where Resolvd's spec says
nothing, the "Change" column says so, and the gap is listed under open questions so the Resolvd plan can
pin it before Resolvd's Phase 1 is built.

### What already matches

- **Enum:** `user_role` = `('end_user', 'technician', 'admin')`.
- **`organizations`:** all six columns, including the types ScreenGuide had to assume
  (`name VARCHAR(100) NOT NULL`, `slug VARCHAR(50) NOT NULL UNIQUE`), `next_ticket_number INT NOT NULL
  DEFAULT 1001`, and both timestamps.
- **`users`:** all 14 columns with the same types, defaults and `NOT NULL`s, including `name`, `email`
  and `password_hash` (`NOT NULL` in both). Also `users_email_lower_idx ON users (LOWER(email))` and
  `UNIQUE (organization_id, id)`.
- **Tenancy helpers:**
  - `set_updated_at()` (`NEW.updated_at = NOW()`);
  - `current_org_id()` = `NULLIF(current_setting('app.current_org_id', true), '')::INT`,
    `LANGUAGE sql STABLE`;
  - `set_config('app.current_org_id', $1, true)` with `String(orgId)`.
- **Policies:** `org_isolation` with `USING` and `WITH CHECK` on `organization_id = current_org_id()`;
  `org_self` on `organizations` with `USING (id = current_org_id())`.
- **`create_organization(p_name TEXT, p_slug TEXT) RETURNS INT`**, `SECURITY DEFINER`,
  `SET search_path = public`, `REVOKE ALL ... FROM PUBLIC`, `GRANT EXECUTE` to `resolvd_app` only.
- **Roles and grants:** exactly two roles, `resolvd_owner` and `resolvd_app`; the app never owns
  tables. `resolvd_app` has `USAGE` on schema `public`, `SELECT, INSERT, UPDATE, DELETE` on `users` and
  `SELECT, UPDATE` on `organizations`.
- **Auth spec** (ScreenGuide's Phase 3 isn't built yet; its plan matches):
  - cookie `resolvd_token` (`httpOnly`, `secure` in production, `sameSite: 'lax'`, `path: '/'`, 8 h);
  - JWT `{ sub, org }` with `expiresIn: '8h'`, and the role always loaded from the database;
  - lockout 5 attempts / 15 minutes, with the counter reset when the lock is set;
  - passwords 10–72 characters with a letter and a number; bcryptjs cost 12; the login schema only
    checks for non-empty values; the same 401 for an unknown email and a wrong password; the login
    limiter is 10 per 15 minutes.
- **Errors:** `AppError` has `status, code, message, details`, and responses are
  `{ error: { code, message, details? } }`. Both map `23505` → 409 `CONFLICT`, `23503` → 400
  `INVALID_REFERENCE`, and anything else → 500 `INTERNAL_ERROR` with no internals.
- **Layout:** `src/modules/<feature>/<feature>.{routes,controller,service,queries,schemas}.js`, with
  middleware → route + `validate()` → controller → service (`withOrg`) → queries (`client` first).
  `validate()` puts the parsed query on `req.validatedQuery`. `withTransaction(work)`,
  `setOrg(client, orgId)` and `withOrg(orgId, work)` live in `src/db/withOrg.js`.
  `src/config/env.js`, `src/utils/AppError.js`, `src/middleware/errorHandler.js`,
  `src/middleware/notFound.js`, `src/modules/health/health.routes.js`, `src/docs.js`,
  `src/modules/organizations/defaults.js` and `src/utils/pagination.js` have the same paths. Relative
  imports include `.js`.
- **Platform:**
  - Node 26 and Express 5; the same shared server packages (plus each app's own additions);
  - `trust proxy` 1, `express.json({ limit: '100kb' })`, a general `/api` limiter of 300/min;
  - OpenAPI 3.0.3 at `/api/docs`;
  - Prettier settings and `.gitattributes` `* text=auto eol=lf`;
  - the React component structure; `RES-` + `ticket_number` display ids.

### Differences

| # | Area | Resolvd (spec) | ScreenGuide (code) | Change | Notes |
|---|---|---|---|---|---|
| 1 | `org_self` policy | `USING (id = current_org_id())` only | `USING` **and** `WITH CHECK (id = current_org_id())` (007) | **ScreenGuide**: drop `WITH CHECK`, or Carter amends RESOLVD_PLAN 1.3 | Same behaviour: when `WITH CHECK` is omitted, PostgreSQL uses the `USING` expression for new rows too. Only the catalog differs. Conflicts with DECISIONS 23 and 33. |
| 2 | `auth_find_user_by_email` return columns | `id, organization_id, password_hash, role, is_active, failed_login_attempts, locked_until` (7) | `id, organization_id, name, email, password_hash, role, is_active, failed_login_attempts, locked_until` (9, different order) | **ScreenGuide**: return exactly Resolvd's 7 columns in Resolvd's order | Return types are part of the function signature, so both apps must match exactly. Conflicts with DECISIONS 33. Nothing outside the RLS tests calls it yet. |
| 3 | `auth_record_login_failure(p_user_id INT, p_max_attempts INT, p_lock_minutes INT)` | Exists in 007: increments the counter; at the max, sets `locked_until = NOW() + lock` and resets the counter. Called outside any transaction that will roll back. | **Missing.** ScreenGuide's plan commits the failed-attempt update in a separate transaction instead | **ScreenGuide**: add it (same signature, `SECURITY DEFINER`, `SET search_path = public`, `EXECUTE` only for `resolvd_app`) and use it in Phase 3 | **Resolvd's plan doesn't state the return type** (open question A). |
| 4 | Sequence grants | `GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO resolvd_app` | `USAGE, SELECT ON SEQUENCE users_id_seq` only, plus named sequences in 111 | **ScreenGuide**: grant like Resolvd | Practical effect today: `resolvd_app` lacks `USAGE` on `organizations_id_seq` (orgs are only inserted through `create_organization`, so nothing breaks). |
| 5 | `updated_at` trigger names | Not specified for `organizations`/`users`; the only example is `tickets_updated_at` (`<table>_updated_at`) | `organizations_set_updated_at`, `users_set_updated_at` | **Resolvd plan should pin the name** (open question B) | Cosmetic, but a mismatch means two triggers or a failed `DROP TRIGGER` when the shared migrations meet. |
| 6 | CI database image | `postgres:18` (Phase 9.3) | `postgres:17`, from ScreenGuide plan 4.7 #7, which said Resolvd used 17 | **ScreenGuide**: switch CI to `postgres:18` | Local PostgreSQL on Carter's PC is 18 in both. |
| 7 | Setup script | `server/db/setup.sql`; roles created with top-level `SELECT format(...) WHERE NOT EXISTS \gexec`; tells Carter to clear the command from PowerShell history | `server/db/setup/setup.sql`; roles created in a `DO` block reading `set_config` values; explicit `NOSUPERUSER … NOBYPASSRLS`; revokes `PUBLIC` connect | **ScreenGuide (optional)**: path and technique; **add the PowerShell history advice** to the README | Same effect: create-if-missing, never change passwords. The roles already exist on the laptop (made by ScreenGuide), so Resolvd's script will skip them. |
| 8 | `GET /api/health` | `SELECT 1` → `{ status: 'ok', database: 'up' }`, or 503 `{ status: 'degraded', database: 'down' }`; Render's health check uses it | Liveness only, `{ status: 'ok' }` with no database; database + jobs on `/api/ready` (503 `status: 'unavailable'`); Render planned to use `/api/ready` | **ScreenGuide**: make `/api/health` match Resolvd's exactly; keep `/api/ready` as the allowed addition (align its 503 status word to `'degraded'`) | ScreenGuide plan 8.7 defined `/api/health` as no-DB; Resolvd wins for the shared route. |
| 9 | 404 code | `NOT_FOUND` from `notFound.js` | `ROUTE_NOT_FOUND` | **ScreenGuide** | Conflicts with DECISIONS 38. |
| 10 | Zod errors | Error handler maps **any** `ZodError` → 400 `VALIDATION_ERROR`, `details = err.flatten()` (`{ formErrors, fieldErrors }`) | `validate()` produces `details: [{ location, path, message }]`; a `ZodError` thrown anywhere else becomes 500 | **ScreenGuide**: use Resolvd's details shape and handle `ZodError` in the handler | The client's `ApiError` parses `details`, so the shape must be identical. Zod 4 deprecates `err.flatten()` for `z.flattenError(err)` (same output), so Resolvd's wording should name the Zod 4 form. Internal validation (AI output, job payloads) must then raise `AppError.internal`, not a bare `ZodError`, or a server bug would look like a 400. |
| 11 | `22P02` (invalid text representation) | → 400 `INVALID_INPUT` | Not mapped (becomes 500) | **ScreenGuide** | |
| 12 | Body-parser errors | Not specified | 400 `INVALID_JSON`, 413 `PAYLOAD_TOO_LARGE`, 415 | **Resolvd plan** could adopt (open question C) | Without them, bad JSON in Resolvd reaches the generic handler. DECISIONS 38 suggested Resolvd copy them. |
| 13 | `AppError` helpers | `badRequest, unauthorized, forbidden, notFound, conflict, tooManyRequests` (signatures unspecified) | Those six plus `validation, unprocessable, internal, serviceUnavailable`; `badRequest(message, details, code)` | **Resolvd plan should pin signatures** (open question C) | Superset, so compatible as long as signatures match. |
| 14 | Auth middleware file | `src/middleware/auth.js` exports `authenticate` and `requireRole` | Planned as `authenticate.js` + `requireRole.js` (not built) | **ScreenGuide** (Phase 3) | |
| 15 | `req.user` | `{ id, orgId, role, name, email }` | Planned `{ id, orgId, role }`; the Phase 2 test stand-in uses that | **ScreenGuide** (Phase 3) | |
| 16 | Login details | Inactive → same 401 as an invalid login; locked → 401 "Account temporarily locked. Try again later."; dummy hash made with `bcrypt.hashSync` at startup (not hardcoded); bad or expired JWT → 401 "Session expired"; logout → 204 | Plan only says "same message for unknown email and wrong password" and "dummy bcrypt compare" | **ScreenGuide** (Phase 3) | |
| 17 | Registration | `organizationName` 2–100, `slug` `^[a-z0-9-]{3,50}$`, `name` 1–100, email lowercased; 409s by constraint: "That email is already registered" / "That URL name is taken"; inserts default categories and SLA policies | Same field names; limits and messages not specified; creates `org_settings` + admin preferences instead | **ScreenGuide** (Phase 3): adopt the limits and messages | Categories/SLA: see #18. |
| 18 | Default categories and SLA policies | `DEFAULT_CATEGORIES = ['Hardware','Software','Network','Account Access','Email','Other']`; `DEFAULT_SLA_POLICIES` critical 60/240, high 240/1440, medium 480/2880, low 1440/7200 min; tables `categories`, `sla_policies` (004) | None. The `categories`/`sla_policies` tables are in Resolvd's 004, which ScreenGuide intentionally leaves unused; ScreenGuide's `assist_category` enum is a different list | **Neither now. Merge task:** backfill default categories and SLA policies for every org created in ScreenGuide, and map `assist_category` → Resolvd category for `categoryHint` | Proposed mapping: printer → Hardware, network → Network, email → Email, m365 → Software, account → Account Access, performance → Hardware, browser → Software, audio_video → Hardware, other → Other. |
| 19 | Test seed | Acme slug **`acme-corp`**; password from **`SEED_PASSWORD` in `.env`** (required, never printed); `USERS` export keyed by org and role; `scripts/lib/seed.js`; `TRUNCATE … RESTART IDENTITY CASCADE` | Acme slug **`acme`**; password **hardcoded** (`ScreenGuide123`, exported and printed by the CLI); `SEED_ORGS` array + `seedEmail()`; deletes by slug | **ScreenGuide** | Matters when the test suites merge. The hardcoded password also breaks Resolvd's rule against passwords in committed files. |
| 20 | Script layout | `scripts/lib/migrate.js` and `scripts/lib/seed.js` export the functions; `scripts/migrate.js` and `scripts/seed.js` are two-line runners | `scripts/migrate.js` and `scripts/seed.js` export and run | **ScreenGuide** | |
| 21 | Test environment | `server/.env.test` (from `.env.test.example`) loaded when `NODE_ENV=test`; `testTimeout: 15000` | Test URLs derived from `.env` with the database name swapped to `screenguide_test`; fixed test-only secrets in `vitest.config.js` | **ScreenGuide** if fully aligning (open question D) | ScreenGuide's way needs no extra file. Resolvd's is the convention. |
| 22 | `env.js` | `JWT_SECRET` min 32 characters; exports `env` **and `isProd`**; Phase 10 adds `TRUST_PROXY_HOPS` (default 1) and `LOG_CLIENT_IP` | `JWT_SECRET` ≥ 96 hex characters; no `isProd`; `trust proxy` hardcoded to 1; adds `LOG_LEVEL` | **ScreenGuide**: export `isProd`, add `TRUST_PROXY_HOPS` (needed behind Vercel → Render) | The stricter secret rule is harmless (each app has its own secret). |
| 23 | Background jobs | `node-cron` (`slaChecker.js`) + `mark_sla_breaches()` definer; v2 email outbox (`claim_outbox_batch`, `complete_outbox_item`) | pg-boss (migration 112), enqueued in the same transaction | **Decide at merge** (Section 4.6 item 4, written in Phase 9) | Already an allowed addition (ScreenGuide plan 4.2). |
| 24 | Integration wire format (`POST /api/integrations/tickets`) | Phase 14 expects response `{ id, display_id }`, idempotency via `Idempotency-Key` **or** the external session id, ticket columns `source` + `external_ref`, `Authorization: Bearer <key>`. It also says ScreenGuide's `docs/resolvd-integration.md` **wins on wire formats** | Plan 4.5: `201 { id, ticketNumber, displayId }`, repeat → `200`, idempotent by `(organization_id, source, externalId)`, keys `rsv_<prefix>_<secret>` | **ScreenGuide's integration doc** (Phase 9) must state each of these explicitly; Resolvd follows it | Field casing (`displayId` vs `display_id`) and the idempotency key are the real gaps. |

### Statements in ScreenGuide's own plan that are out of date

| Where | Says | Resolvd now |
|---|---|---|
| Plan 4.6 #5 | Resolvd Phase 14 (v3) plans its own text RAG assistant with **pgvector** retrieval | Phase 14 **is** the ScreenGuide integration (API keys + ticket intake). Its KB (Phase 11) uses PostgreSQL **full-text search** (`tsvector`), with no pgvector. Rewrite merge item 5 in Phase 9. |
| Plan 4.7 #7 | Resolvd's CI uses `postgres:17` | `postgres:18` (difference #6). |
| `CLAUDE.md` / plan header | "Resolvd has not been built yet … don't look for a Resolvd repo" | The repo exists (Phase 0 done) and is being built from `RESOLVD_PLAN.md`. Its spec, not the code, is the reference until its Phase 1 lands. |
| Plan 4.3 | Resolvd's later numbers aren't listed | Resolvd plans `008_sla_breaches`, `009_knowledge_base`, `010_email_outbox` and `011_api_keys`. ScreenGuide's 100+ migrations are renumbered after whichever is latest. |

### Open questions for Carter

- **A.** Return type of `auth_record_login_failure` (Resolvd plan 1.3 doesn't say). Suggested:
  `RETURNS VOID` (the login code only needs the failure saved). Both apps must use the same type.
- **B.** Trigger names on the shared tables: pin `organizations_set_updated_at` / `users_set_updated_at`
  (what ScreenGuide's pushed 002/003 already use), or Resolvd's `<table>_updated_at` pattern (then
  ScreenGuide renames them).
- **C.** Should RESOLVD_PLAN pin the `AppError` helper signatures and the body-parser error codes
  (#12, #13), or leave them to Resolvd's Phase 2?
- **D.** How far to align the test setup (#21): adopt `.env.test`, or keep ScreenGuide's derived test
  URLs?
- **E.** How to fix the pushed shared migrations (#1–#4). ScreenGuide has no production database yet,
  so editing `007` in place and resetting `screenguide_dev`/`screenguide_test` keeps the shared files
  identical to Resolvd's. A new 1xx migration that redefines a 007 function would itself have to be
  dropped at merge time. Editing a pushed migration breaks the "never edit a committed migration" rule,
  so this is Carter's call.

### Fix order (when Carter says to go ahead)

1. Shared-shape SQL (#1–#4, plus #5 once B is decided), per E. Do this before Resolvd's Phase 1 is
   built, so both repos start from identical 001–007 files.
2. HTTP conventions that already exist in ScreenGuide's code: #8–#11, #22.
3. Seed and script layout: #19, #20 (and #21 if D says so).
4. Phase 3 work that must follow Resolvd from the start: #14–#17.
5. CI image: #6. Setup-script note: #7.
6. Phase 9: write `docs/resolvd-integration.md` with every wire detail from #24, and the rest of this
   file (#18, #23 and the outdated statements above).
