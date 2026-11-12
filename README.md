# ScreenGuide AI

Voice-first AI tech support for small businesses. Share your screen, describe the problem out loud, and
ScreenGuide talks you through the fix one step at a time, highlighting where to click. It never controls
your computer. When it can't fix something, it writes an escalation ticket that can go straight into
[Resolvd](docs/architecture.md#overview), its sister helpdesk app.

> **Status:** early development (Phase 0: repo and tooling). The full README comes in Phase 11.

## Local setup (Windows)

Requirements: **Node.js 26 LTS**, Git, and **PostgreSQL** installed locally (EDB installer with pgAdmin and
`psql`). Docker is not used.

### 1. Create the database roles and databases (once per machine)

From the repo root, as the `postgres` superuser:

```powershell
psql -U postgres -v owner_pw="YourOwnerPassword1" -v app_pw="YourAppPassword1" -f server/db/setup/setup.sql
```

This creates two roles and two databases:

| Role | Used for |
|---|---|
| `resolvd_owner` | Owns the databases and tables; runs migrations and seeds |
| `resolvd_app` | What the API connects as; owns nothing, so row-level security always applies |

and `screenguide_dev` / `screenguide_test`, owned by `resolvd_owner`. It's safe to run again: anything that
already exists is left alone.

**Why `resolvd_*` role names in a ScreenGuide repo?** ScreenGuide is designed to merge into Resolvd later
and share one database with it, so both apps use the same two roles. PostgreSQL roles belong to the whole
server, not to one database, so the setup script **creates them only if they're missing and never changes
an existing password**. Whichever project you set up first on a machine creates the roles; the other reuses
them with the same passwords.

Use letters and digits only in the passwords (they go into connection URLs).

### 2. Configure the server

```powershell
Copy-Item server/.env.example server/.env
```

Then edit `server/.env` (never commit it). See `server/.env.example` for every variable.

### 3. Create the tables and sample data

```powershell
cd server; npm install
npm run migrate    # applies db/migrations to screenguide_dev as resolvd_owner
npm run seed       # resets the database to the Acme Corp and Globex sample orgs
```

Every seeded user signs in with the `SEED_PASSWORD` you set in `server/.env` (it's never printed or
committed). `npm run seed` prints the logins, for example `admin@acme.test`. It **wipes every
organization** in `screenguide_dev`, like Resolvd's seed, and refuses to run with
`NODE_ENV=production`. `npm test` uses the separate `screenguide_test` database and resets it on every
run.

### 4. Run

```powershell
cd server; npm run dev                  # API on http://127.0.0.1:4001
cd client; npm install; npm run dev     # app on http://127.0.0.1:5174 (second terminal)
```

Check the API at `http://127.0.0.1:4001/api/ready` (database and job queue status) and browse the API
docs at `http://127.0.0.1:4001/api/docs`. After pulling new code, run `npm run migrate` again; the
API refuses to start the job queue if the database is behind.

### Running alongside Resolvd

Both apps use a login cookie named `resolvd_token`, and browsers don't separate cookies by port. Open
ScreenGuide at **`http://127.0.0.1:5174`** and Resolvd at **`http://localhost:5173`**: different hosts keep
the cookies apart, so logging into one doesn't log you out of the other.

## Scripts

| | server | client |
|---|---|---|
| Dev server | `npm run dev` | `npm run dev` |
| Lint (ESLint + Prettier) | `npm run lint` | `npm run lint` |
| Tests (Vitest) | `npm test` | `npm test` |
| Other | `npm start`, `npm run migrate`, `npm run seed`, `npm run seed:demo`, `npm run kb:build` | `npm run build` |

`seed:demo` and `kb:build` are placeholders until Phase 9.

## Docs

- [Architecture](docs/architecture.md)
- [Decisions](docs/DECISIONS.md)
- [Progress](docs/PROGRESS.md)
