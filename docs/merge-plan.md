# Merge plan: ScreenGuide AI → Resolvd

> **Status:** compatibility check re-run on 2026-11-11 against Resolvd's real Phase 1 code; auth check
> run on 2026-11-12 against Resolvd's real Phase 3 code (see "Auth compatibility check" below). The full
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

## Auth compatibility check (2026-11-12)

**What was compared.** Resolvd at commit **`098c560`** (end of its Phase 3: auth, users, categories;
cloned read-only outside this repo) against ScreenGuide at `dea28a4`. This compares Resolvd's real code
and its `docs/DECISIONS.md`, not just its plan.

**Shared migrations and seed:** Resolvd hasn't changed `001`–`003`, `007` or `db/seeds/users.js`
since `198e1f8`, so the earlier file-level result still holds.

**ScreenGuide's auth isn't built yet** (no `middleware/auth.js`, no `modules/auth`, `users`,
`categories` or `invitations`). The exact list of what Phase 3 copies from Resolvd, and what
ScreenGuide adds on top, is recorded as binding in **DECISIONS 52** (it supersedes DECISIONS 49 where
they differ). Key points:

| Area | Resolvd's actual behaviour (copy this) |
|---|---|
| `src/middleware/auth.js` | One file. `authenticate`: no cookie → 401 "Authentication required"; a bad or expired token, a non-integer `sub`/`org`, or a missing or inactive user → 401 "Session expired. Please sign in again." Sets `req.user = { id, orgId, role, name, email }` from a fresh DB read in `withOrg`. `requireRole(...roles)` → 403, runs before `validate`. |
| Cookie / JWT | `resolvd_token`, `httpOnly`, `secure: isProd`, `sameSite: 'lax'`, `path: '/'`, `maxAge` 8 h. JWT `{ sub, org }`, `expiresIn: '8h'`, verify pins `HS256`. Clear with the same options. |
| Schemas | `emailSchema` (trim, lowercase, email, max 255); `personNameSchema` (1–100); `passwordSchema` (10–72 characters **and ≤ 72 bytes**, a letter, a number; exact messages in DECISIONS 52); slug `^[a-z0-9-]{3,50}$`; `loginSchema` only checks that the fields are non-empty. |
| Login | Pool lookup via `auth_find_user_by_email`. Unknown **or inactive** → bcrypt against the account's own hash or a `DUMMY_HASH` generated at startup → 401 `INVALID_CREDENTIALS`. Locked → 401 `ACCOUNT_LOCKED`, checked before the password, no bcrypt. Wrong password → `auth_record_login_failure(id, 5, 15)` on the pool (autocommit) → `INVALID_CREDENTIALS`. Success → reset attempts and the lock and set `last_login_at` in `withOrg`. |
| Login limiter | 10 / 15 min / IP, message "Too many login attempts. Try again in 15 minutes." |
| Register | Hash before the transaction; `create_organization` → `setOrg` → admin insert. `23505` mapped by constraint name to 409 with `fieldError` details. 201 + cookie. |
| Logout / me | Logout needs **no session**, returns 204. Register, login and `/me` all return `{ user, organization: { id, name, slug } }`. |
| Users | `GET` (T, A; technicians see only `id, name, role`), `POST` (A), `PATCH /users/me` (anyone: name, notifications, password with the current one), `PATCH /users/:id` (A). Last admin: lock every active admin row `FOR UPDATE` in id order, then 400 `CANNOT_CHANGE_SELF` / `LAST_ADMIN`. Wrong current password → 400 `INVALID_PASSWORD`. |
| Categories | Any signed-in user lists; admins create and rename (never delete); duplicate → 409 with a field error. **Not built in ScreenGuide** (no table); it moves with Resolvd at merge. |
| Wire format | Output snake_case as stored, request bodies camelCase; lists `{ data }`; single records bare. |
| Wrong `Content-Type` | No 415 middleware. A non-JSON body isn't parsed, so `req.body` is `undefined` and `validate` returns 400 `VALIDATION_ERROR`. 415 only for an unsupported charset or encoding. |

### Differences in code ScreenGuide has already built

These are the shared Phase 2 files that Resolvd built differently. **Reported only, not fixed yet.**
Rule: Resolvd is the source of truth, so ScreenGuide changes unless the row says otherwise.

| # | Area | Resolvd (`098c560`) | ScreenGuide (`dea28a4`) | Which side changes |
|---|---|---|---|---|
| A1 | `AppError` helper signatures | Every helper is `(message, details, code)` | `validation(details, message)`; `unauthorized`/`forbidden`/`notFound(message, code)` with no details; `conflict`/`unprocessable(message, code, details)`; `tooManyRequests(message)`, `internal(message)` and `serviceUnavailable(message, code)` take no code or details | **ScreenGuide**: copy Resolvd's `AppError.js`. Call sites to update: `errorHandler.js`, `idempotent.js`, `app.test.js`, `idempotency.test.js`. Resolvd's DECISIONS (Phase 2) asks for exactly this alignment; its file comment already claims to match. |
| A2 | `AppError` default messages | unauthorized "Authentication required"; forbidden "You do not have permission to do that"; validation "Validation failed"; unprocessable "Unprocessable request"; tooManyRequests "Too many requests. Try again later."; serviceUnavailable "Service temporarily unavailable" | "Please sign in to continue"; "You don't have permission to do that"; "Some fields are missing or invalid"; no default; "Too many requests, please try again later"; "Service unavailable" | **ScreenGuide** |
| A3 | 429 code | `TOO_MANY_REQUESTS` | `RATE_LIMITED` (also pinned in `idempotent.test.js`) | **ScreenGuide** |
| A4 | `validate()` with a missing part | `schema.parse(req.body)`: `undefined` fails (wrong `Content-Type` → 400) | `safeParse(req[location] ?? {})`: a missing body becomes `{}`, so an all-optional schema passes, and others report field errors instead of "expected object" | **ScreenGuide**: drop `?? {}` (copy Resolvd's `validate.js`) |
| A5 | Error-handler messages | `23505` "That record already exists"; `23503` "A referenced record does not exist"; `22P02` "A value has the wrong format"; "Request body is not valid JSON"; "Request body is too large"; "Unsupported request body charset" / "…encoding" (two messages) | "That already exists"; "A referenced item does not exist"; "Invalid input"; "The request body is not valid JSON"; "The request body is too large"; one "Unsupported request encoding" | **ScreenGuide** (codes already match) |
| A6 | Error handler when headers were already sent | `return next(err)`, before logging | Logs the error, then `res.end()` | **ScreenGuide** |
| A7 | 404 message | `Route not found: GET /api/x` | `No route for GET /api/x` | **ScreenGuide** |
| A8 | Rate-limit module | `middleware/rateLimit.js`, `createRateLimiter({ windowMs, limit, message })` | `middleware/rateLimits.js`, named factories, one generic message | **ScreenGuide**: adopt Resolvd's file and factory. Keep the register (5/h) and ws-ticket (per user) limiters as additions built on it. The ws-ticket limiter needs an optional `keyGenerator`, which Resolvd can adopt. |
| A9 | `withTransaction` hardening | Listens for client `error` while checked out; passes the broken connection to `release(err)` so it's destroyed; logs a failed rollback | Swallows a failed rollback and always calls `release()` | **ScreenGuide**: copy Resolvd's version. Resolvd has a test showing that without the listener a late `ECONNRESET` crashes the process. |
| A10 | `setOrg` guard | No check | Throws on a non-positive or non-integer `orgId` | **Keep ScreenGuide's**, which is stricter. Resolvd may adopt it. |
| A11 | `trust proxy` | Hardcoded `1` | `TRUST_PROXY_HOPS` (default 1) | **Resolvd**, already planned (DECISIONS 47) |
| A12 | Register limiter | None | 5 / hour / IP (plan 8.5) | **Keep** as a ScreenGuide addition; Resolvd may adopt it |

### Statements that are now out of date (adds to the table above)

| Where | Says | Now |
|---|---|---|
| Plan 8.1 / 13 file tree | `req.user = { id, orgId, role }`; `authenticate.js` and `requireRole.js` as separate files | `{ id, orgId, role, name, email }`; one `middleware/auth.js` (DECISIONS 52) |
| Plan 17.1 | `POST /auth/logout` roles "any" | No session required (Resolvd) |
| Plan 17.1 | `PATCH /users/:id`: role, active, name | Also `department`. A separate `PATCH /users/me` (own name, notifications, password) is shared with Resolvd |
| DECISIONS 49 | "Missing or inactive user → 401"; inactive gets the same 401 | Exact messages, and bcrypt runs for inactive accounts too (DECISIONS 52) |
| `CLAUDE.md` | "Resolvd has not been built yet" | Resolvd has finished Phase 3. *(Carter's file, not edited.)* |

## Sections to write in Phase 9 (plan Section 4.6)

1. What moves (server modules, client features, migrations 100+ renumbered).
2. `TicketSink` swap: `ResolvdHttpSink` → `ResolvdInProcessSink`.
3. WebSocket attach point in Resolvd's `server.js` and the matching shutdown steps.
4. Background jobs decision: Resolvd's `node-cron` + outbox vs pg-boss, with the recommendation.
5. Resolvd v3 overlap (rewritten for Resolvd's current Phase 14).
6. Additions Resolvd would gain.
