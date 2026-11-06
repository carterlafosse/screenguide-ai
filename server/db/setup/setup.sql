-- setup.sql: one-time local database setup for ScreenGuide AI.
--
-- Run once as the postgres superuser, from the repo root:
--   psql -U postgres -v owner_pw="..." -v app_pw="..." -f server/db/setup/setup.sql
--
-- What it does (safe to run any number of times):
--   1. Creates the two shared Resolvd roles, resolvd_owner and resolvd_app, ONLY if
--      they don't exist yet. Roles are cluster-wide in PostgreSQL, so if Resolvd (or
--      an earlier run) already created them, they are left untouched: existing
--      passwords and attributes are never changed.
--   2. Creates screenguide_dev and screenguide_test owned by resolvd_owner, ONLY if
--      they don't exist yet.
--   3. Locks the two databases down so only the two roles can connect.
--
-- Passwords come in as psql variables and are never stored in this file.
-- Use letters and digits only (they go into connection URLs in server/.env).

\set ON_ERROR_STOP on
\set QUIET on

-- ----- Check the password variables were passed -----
-- A failing statement (with ON_ERROR_STOP) makes psql exit non-zero.
\if :{?owner_pw}
\else
  \echo 'ERROR: missing owner_pw. Run: psql -U postgres -v owner_pw="..." -v app_pw="..." -f server/db/setup/setup.sql'
  SELECT 1 / 0 AS setup_aborted_missing_owner_pw;
\endif
\if :{?app_pw}
\else
  \echo 'ERROR: missing app_pw. Run: psql -U postgres -v owner_pw="..." -v app_pw="..." -f server/db/setup/setup.sql'
  SELECT 1 / 0 AS setup_aborted_missing_app_pw;
\endif

-- psql does not substitute variables inside a DO $$ ... $$ body, so hand the
-- passwords to the DO block through session-local settings (cleared below).
SELECT set_config('screenguide_setup.owner_pw', :'owner_pw', false) \gset setup_ignore_
SELECT set_config('screenguide_setup.app_pw', :'app_pw', false) \gset setup_ignore_

-- ----- Roles (create only if missing; never alter existing ones) -----
DO $$
DECLARE
  v_owner_pw TEXT := current_setting('screenguide_setup.owner_pw');
  v_app_pw   TEXT := current_setting('screenguide_setup.app_pw');
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'resolvd_owner') THEN
    IF length(v_owner_pw) < 12 THEN
      RAISE EXCEPTION 'owner_pw must be at least 12 characters';
    END IF;
    -- Owns the databases and (from Phase 1) every table; runs migrations and seeds.
    EXECUTE format(
      'CREATE ROLE resolvd_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
      v_owner_pw);
    RAISE NOTICE 'Created role resolvd_owner';
  ELSE
    RAISE NOTICE 'Role resolvd_owner already exists: left unchanged (password not modified)';
  END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'resolvd_app') THEN
    IF length(v_app_pw) < 12 THEN
      RAISE EXCEPTION 'app_pw must be at least 12 characters';
    END IF;
    -- Runtime role for the API. Owns nothing, so row-level security applies to it.
    EXECUTE format(
      'CREATE ROLE resolvd_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
      v_app_pw);
    RAISE NOTICE 'Created role resolvd_app';
  ELSE
    RAISE NOTICE 'Role resolvd_app already exists: left unchanged (password not modified)';
  END IF;
END
$$;

-- Clear the passwords from the session settings.
SELECT set_config('screenguide_setup.owner_pw', '', false) \gset setup_ignore_
SELECT set_config('screenguide_setup.app_pw', '', false) \gset setup_ignore_

-- ----- Databases (create only if missing) -----
-- CREATE DATABASE can't run inside a DO block or a transaction, so build the
-- statement with SELECT and run it with \gexec (no rows = nothing runs).
SELECT 'CREATE DATABASE screenguide_dev OWNER resolvd_owner ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'screenguide_dev') \gexec

SELECT 'CREATE DATABASE screenguide_test OWNER resolvd_owner ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'screenguide_test') \gexec

-- ----- Database access (idempotent) -----
-- Only the two roles may connect. Table, schema and function grants for
-- resolvd_app are made by the numbered migrations (Phase 1+).
REVOKE ALL ON DATABASE screenguide_dev FROM PUBLIC;
REVOKE ALL ON DATABASE screenguide_test FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE screenguide_dev TO resolvd_app;
GRANT CONNECT, TEMPORARY ON DATABASE screenguide_test TO resolvd_app;

\unset QUIET
\echo ''
\echo 'Setup complete. Current state:'
SELECT rolname AS role, rolcanlogin AS can_login, rolsuper AS superuser, rolbypassrls AS bypass_rls
FROM pg_roles
WHERE rolname IN ('resolvd_owner', 'resolvd_app')
ORDER BY rolname;

SELECT d.datname AS database, pg_get_userbyid(d.datdba) AS owner, pg_encoding_to_char(d.encoding) AS encoding
FROM pg_database d
WHERE d.datname IN ('screenguide_dev', 'screenguide_test')
ORDER BY d.datname;
