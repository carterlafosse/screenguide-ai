-- rls-demo.sql: shows row-level security working, for the Phase 1 screenshot.
-- Run as the runtime role after `npm run migrate` and `npm run seed`:
--   psql -U resolvd_app -d screenguide_dev -f docs/rls-demo.sql

\echo '1. Connected as:'
SELECT current_user;

\echo '2. No org set: resolvd_app sees no sessions at all (expect 0 rows)'
SELECT id, organization_id, status, title FROM assist_sessions;

\echo '3. Inside a transaction with Acme''s org set: only Acme''s sessions'
BEGIN;
-- Find Acme's org id via the login lookup function (the app role can't read organizations yet).
SELECT set_config('app.current_org_id',
                  (SELECT organization_id::text FROM auth_find_user_by_email('admin@acme.test')),
                  true) AS current_org_id;
SELECT id, organization_id, status, title FROM assist_sessions ORDER BY id;
COMMIT;

\echo '4. After the transaction: the setting is gone, so 0 rows again'
SELECT id, organization_id, status, title FROM assist_sessions;
