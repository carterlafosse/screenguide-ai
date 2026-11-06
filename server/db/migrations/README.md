# Migrations

Numbered `.sql` files applied in order by `scripts/migrate.js` (added in Phase 1), each in one
transaction, recorded in `schema_migrations`, run as `resolvd_owner` via `MIGRATION_DATABASE_URL`.

- `001`–`003`, `007` mirror Resolvd's shared migrations exactly (plan Section 4.3).
- `004`–`006` are **intentionally unused**: in Resolvd they hold categories/SLA, tickets and
  comments/events, which ScreenGuide does not have. The gap keeps both histories aligned.
- ScreenGuide's own schema starts at `100` and never alters `organizations` or `users`.
