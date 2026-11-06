# ScreenGuide AI: Architecture

> Living document, started in Phase 0. Each phase fills in its section. The full specification is
> `SCREENGUIDE_PLAN.md`; this file describes what is actually built.

## Overview

ScreenGuide AI is a voice-first tech support assistant. The user shares their screen in the browser and
talks; the AI sees the screen, speaks back, highlights where to click and notices when each step is done.
It never controls the computer. Escalations become tickets that can be pushed into Resolvd, the sister
helpdesk app that ScreenGuide is designed to merge into later.

```
Browser (React on Vercel)
  ├─ REST  /api/*  ──(Vercel rewrite; Vite proxy in dev)──►  Express API (Render)
  └─ WebSocket /ws ──(direct to Render; Vite proxy in dev)─►    ├─ HTTP routes → services → queries
                                                                ├─ WebSocket session channels
                                                                ├─ pg-boss workers
                                                                └─ PostgreSQL (Neon): RLS, two roles
```

## Repository layout

| Path | What it is |
|---|---|
| `server/` | Express 5 API, JavaScript ES modules, raw SQL with `pg` |
| `server/db/setup/setup.sql` | One-time local setup: roles and databases (run as `postgres`) |
| `server/db/migrations/` | Numbered SQL migrations (Phase 1) |
| `server/src/` | `app.js` (`createApp()`), `server.js` (listen + shutdown), modules (Phase 2+) |
| `server/tests/` | Vitest + Supertest against a real PostgreSQL test database |
| `client/` | Vite + React (JSX), Mantine, TanStack Query, React Router, Zustand |
| `docs/` | Decisions, progress, architecture and protocol docs |
| `.github/workflows/ci.yml` | CI: server (Postgres 17 service) and client jobs |

## Local development topology

| Piece | Address | Notes |
|---|---|---|
| API | `http://127.0.0.1:4001` | Resolvd uses `localhost:4000` |
| Client (Vite) | `http://127.0.0.1:5174` | Resolvd uses `localhost:5173` |
| `/api`, `/ws` | proxied by Vite to `127.0.0.1:4001` | keeps cookies same-origin in dev |
| PostgreSQL | `localhost:5432` | locally installed (EDB), no Docker |

ScreenGuide runs on `127.0.0.1` and Resolvd on `localhost` because browsers don't separate cookies by
port: both apps use a cookie named `resolvd_token`, and different hosts keep them apart.

## Database roles

Exactly two roles, shared with Resolvd (cluster-wide in PostgreSQL):

- **`resolvd_owner`**: owns `screenguide_dev`, `screenguide_test` and (from Phase 1) every table. Runs
  migrations and seeds through `MIGRATION_DATABASE_URL`.
- **`resolvd_app`**: what the API connects as at runtime (`DATABASE_URL`). Owns nothing, so row-level
  security always applies to it. Only it and the owner can connect to the ScreenGuide databases.

`setup.sql` creates the roles only if they're missing and never changes an existing role's password, so
ScreenGuide and Resolvd can be set up on the same machine in either order.

## Sections to come

- **Database** (Phase 1): tables, shared-shape rule (001–003, 007 mirror Resolvd; 100+ ScreenGuide), RLS,
  definer functions.
- **HTTP request lifecycle** (Phase 2): middleware order, layers, errors, logging, request IDs.
- **Jobs** (Phase 2/6): pg-boss with only the two roles.
- **Auth** (Phase 3).
- **Real-time** (Phase 5): WebSocket ticket auth, session channels (see `docs/ws-protocol.md`).
- **AI engine and voice** (Phases 6–7).
- **Deployment** (Phase 11): Render, Neon, Vercel.
