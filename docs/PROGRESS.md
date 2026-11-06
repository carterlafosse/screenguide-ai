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
