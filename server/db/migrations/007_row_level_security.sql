-- 007_row_level_security.sql: the core of Resolvd's 007, limited to the tables ScreenGuide has.
-- current_org_id(), RLS on users and organizations, the two auth definer functions, grants.

-- ----- Org helper -----
-- Reads the per-transaction setting written by withOrg(); NULL when no org is set.
CREATE FUNCTION current_org_id() RETURNS INT
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_org_id', true), '')::INT
$$;

-- ----- Row-level security -----
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_self ON organizations
  USING (id = current_org_id())
  WITH CHECK (id = current_org_id());

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON users
  USING (organization_id = current_org_id())
  WITH CHECK (organization_id = current_org_id());

-- ----- SECURITY DEFINER functions (run as the owner, so they bypass RLS) -----

-- Login happens before the org is known, so the user is found across all orgs by email.
CREATE FUNCTION auth_find_user_by_email(p_email TEXT)
RETURNS TABLE (
  id                    INT,
  organization_id       INT,
  name                  VARCHAR(100),
  email                 VARCHAR(255),
  password_hash         TEXT,
  role                  user_role,
  is_active             BOOLEAN,
  failed_login_attempts INT,
  locked_until          TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.organization_id, u.name, u.email, u.password_hash, u.role,
         u.is_active, u.failed_login_attempts, u.locked_until
  FROM users u
  WHERE LOWER(u.email) = LOWER(p_email)
$$;

-- Registration creates the org before any org context exists. Returns the new id.
CREATE FUNCTION create_organization(p_name TEXT, p_slug TEXT)
RETURNS INT
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO organizations (name, slug) VALUES (p_name, p_slug) RETURNING id
$$;

REVOKE ALL ON FUNCTION auth_find_user_by_email(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION create_organization(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_find_user_by_email(TEXT) TO resolvd_app;
GRANT EXECUTE ON FUNCTION create_organization(TEXT, TEXT) TO resolvd_app;

-- ----- Grants to the runtime role -----
GRANT USAGE ON SCHEMA public TO resolvd_app;
GRANT SELECT, UPDATE ON organizations TO resolvd_app;
GRANT SELECT, INSERT, UPDATE ON users TO resolvd_app;
GRANT USAGE, SELECT ON SEQUENCE users_id_seq TO resolvd_app;
