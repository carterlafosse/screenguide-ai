# CLAUDE.md — ScreenGuide AI

## Source of truth
- `SCREENGUIDE_PLAN.md` (repo root or `docs/`) is the spec. Follow it exactly.
- Build in the phase order from Section 16. **Stop at the end of every phase**, report results, and wait for "continue".
- If the plan is ambiguous, conflicts with current library docs, or can't be done as written: choose the option closest to the plan's intent and log it in `docs/DECISIONS.md` (date, decision, reason, alternatives). Never silently skip a requirement.
- Update `docs/PROGRESS.md` at the end of each phase: what's done, deviations, known issues, measured numbers (latency, cost).

## Resolvd is the source of truth (non-negotiable)
- Plan Section 4.1 was confirmed by Carter and copied from Resolvd. Never change it. If anything conflicts with it, Section 4.1 wins; log the conflict in `docs/DECISIONS.md`.
- JavaScript ES modules only. **No TypeScript**, no `checkJs`, no `tsc`, no `// @ts-check`.
- Express 5, raw SQL with `pg`, custom numbered migration runner (`schema_migrations`), bcryptjs (never `bcrypt`), jsonwebtoken, cookie-parser, helmet, cors, express-rate-limit, zod, pino, swagger-ui-express + `openapi.yaml`.
- Two DB roles only: `resolvd_owner` (migrations, seeds) and `resolvd_app` (runtime). Never add a third role.
- RLS policy `org_isolation` on every tenant table; `SECURITY DEFINER` functions use `SET search_path = public` and grant EXECUTE only to `resolvd_app`; composite foreign keys via `(organization_id, x_id)`.
- Auth: `resolvd_token` httpOnly cookie, JWT payload `{ sub, org }` only, role loaded from the DB on every request, lockout 5 attempts / 15 minutes, passwords 10–72 chars with a letter and a number, bcryptjs cost 12.
- Never alter `organizations` or `users` (migrations 001–003, 007 mirror Resolvd; 004–006 unused). ScreenGuide schema starts at migration 100.
- Resolvd has not been built yet; ScreenGuide is the first codebase to implement these conventions. Section 4.1 is the complete spec, so don't look for a Resolvd repo. Build the shared parts exactly as written so Resolvd can match them later.

## Before using any library
- Check its current official docs (Express 5, pg, pg-boss, ws, Anthropic SDK, Deepgram, ElevenLabs, Mantine, TanStack Query, Document Picture-in-Picture, Render, Neon, Vercel). Don't rely on memory.

## Back-end rules
- Layers: middleware → route (`validate`) → controller (no business logic) → service (rules, `withOrg` transaction) → queries (plain SQL taking `client`).
- Every tenant query runs inside `withOrg` using the passed `client`, never `pool.query`. The API connects as `resolvd_app`, never the owner.
- Parameterized SQL only (`$1`, `$2`). Never build SQL with string concatenation of user input.
- Validate every HTTP input, every WebSocket message and every AI output with Zod.
- Audited actions write `audit_events` in the same transaction as the change.
- Jobs are idempotent and carry `orgId` and `requestId`.
- Logs never contain frames, audio, transcripts, passwords, cookies or API keys (use pino `redact`).

## Code standards
- Plain JavaScript. A short header comment at the top of each file saying what it does; JSDoc comments are fine as documentation (no type-checking tooling).
- Small, focused files. Vendor SDKs only behind provider modules (`LlmProvider`, `SttRelay`, `TtsStreamer`, `TicketSink`).
- React components (the standard component structure, same as Resolvd): header comment describing the component, then sections in this order with comments — `// ----- State -----`, `// ----- Data -----`, `// ----- Handlers -----`, `// ----- Render -----`. Custom styles in a CSS module beside the component with clear class names. Mantine props for everything else.
- Canadian spelling in all user-facing copy (colour, organization, cancelled, centre).
- Accessibility: keyboard reachable, labelled controls, `aria-live` captions, respect reduced motion.

## Privacy (non-negotiable)
- Never store screen frames unless the org's snapshot setting is on, and then only downscaled per the plan.
- Never store audio.
- Never expose API keys to the client; integration keys are encrypted at rest and never returned.

## Testing
- Write tests with each feature. Every safety-gate rule, router trigger, permission rule and WebSocket guard needs a test.
- The isolation suite and authorization sweep must always pass. If an isolation test fails, fix it before anything else.
- Use `AI_MOCK=true` and the mock Deepgram/ElevenLabs/Resolvd servers in automated tests; never call paid APIs in CI.
- Before finishing a phase, in both `server/` and `client/`: `npm run lint && npm test` (plus `npm run e2e` from Phase 6).

## Git
- Commit after each working step with clear messages (Conventional Commits: `feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`).
- Never commit `.env` files or secrets. Keep `.env.example` current.

## Commands
- One-time local database setup: run `server/db/setup/setup.sql` as the `postgres` superuser (locally installed PostgreSQL, like Resolvd; creates the roles only if missing)
- Local ports: API `127.0.0.1:4001`, client `127.0.0.1:5174` (Resolvd uses `localhost:4000/5173`, so the `resolvd_token` cookies don't collide)
- server: `npm run dev` · `npm start` · `npm run migrate` · `npm run seed` · `npm run seed:demo` · `npm run kb:build` · `npm test` · `npm run lint`
- client: `npm run dev` · `npm run build` · `npm test` · `npm run e2e` · `npm run lint`
