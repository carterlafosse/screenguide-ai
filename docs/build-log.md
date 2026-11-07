# Build log

## Phase 0: Repo and tooling (2026-11-06)

**What was built:**
- Repo foundation: `.gitattributes` (LF line endings), `.gitignore`, `.editorconfig`, `.prettierrc.json`, `.nvmrc` (Node 26) and a README setup guide
- `server/db/setup/setup.sql`: one-time local database setup that creates the `resolvd_owner` and `resolvd_app` roles only if missing (passwords passed in as psql variables, never stored) and the `screenguide_dev` and `screenguide_test` databases owned by `resolvd_owner`; safe to run twice
- Server scaffold (Express 5, plain JavaScript ES modules) with exact-pinned packages, a placeholder `GET /api/health` route, stub scripts for migrate, seed, seed:demo and kb:build, ESLint + Prettier, a Vitest + Supertest smoke test, and `.env.example`
- Client scaffold (Vite 8, React 19, Mantine 9, TanStack Query 5, React Router 8, Zustand) running on `127.0.0.1:5174` with a dev proxy to the API on `127.0.0.1:4001`, a placeholder page with a live API status badge, test helpers and 2 tests
- GitHub Actions CI with two jobs: server (PostgreSQL 17, runs setup.sql twice, lint, tests) and client (lint, tests, production build)
- Docs: `DECISIONS.md` (20 entries), `PROGRESS.md`, `architecture.md` outline, and a migrations README explaining the 004–006 gap
- 7 commits, the last one closing issue #1

**What I tested by hand:**
- /api/health returned ok on Server
- Client showed API connected
- Lint and tests passed in both folders

**Decisions or changes from the plan** (full details in `docs/DECISIONS.md`, entries 10–20):
- Moved to Node 26 LTS, because current React Router, jsdom and Vitest need a newer Node than my 22.14
- `setup.sql` passes passwords through temporary session settings, since psql can't insert variables inside a `DO $$` block. It also stops if a password is missing or under 12 characters, forces UTF8, and only lets the two roles connect
- Server is a placeholder (just `/api/health`); migrate, seed and knowledge scripts are stubs until their phases
- Wrote the client ESLint config by hand, because the new Vite template ships with oxlint instead
- React Router 8 in "data mode" (its standard setup for single-page apps)
- Mantine dates/charts wait until Phase 9 and Playwright until Phase 6
- Blocked the `@scarf/scarf` telemetry install script that Swagger UI pulls in
- Left 4 moderate `npm audit` warnings: all in ESLint dev tools, the only fix is downgrading ESLint, and there are no high or critical issues
- Added `.nvmrc` and `.editorconfig` (not in the plan)
- Note: my local Postgres is 18 but CI uses 17 to match Resolvd, so migrations must only use Postgres 17 features

**Concept checks (in my own words):**
- What does the CI workflow do on every push?
On every push GitHub starts up two new Linux machines. The server job opens up an empty PostgreSQL database and runs the setup.sql twice to prove that its safe to repeat. It checks that both roles can log in, then uses npm ci which installs exactly the versions recorded in the committed lock file (so that every build is reproducible and matches the local tests) and then runs lint and the tests. The clinet job installs, lints, tests and does a production build. If any step fails, the commit will get a red X, so a broken change will show up immediately.

- Why does setup.sql only create the roles if they're missing?
Postgres roles belong to the whole server, not just one database. Resolvd will use the same reoslvd_owner and resolvd_app roles. If the script recreated them/reset their passwords, setting up one project would break the other one's saved connection. Whichever project goes first creates them and the other then needs to reuse them. 

**One thing I'd explain in an interview:**
- My database setup script is idempotent: Re-running my setup script is safe, it gives the API the least access it needs, and it keeps passwords out of the code. CI proves the first part on every push.

## Phase 1: Database, migrations and RLS (2026-11-07)

**What was built:**
- 

**What I tested by hand:**
- 

**Decisions or changes from the plan:**
- 

**Concept checks (in my own words):**
- 

**One thing I'd explain in an interview:**
- 
