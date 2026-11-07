-- 002_organizations.sql: tenant table (mirrors Resolvd's 002; never altered by ScreenGuide).
-- name/slug types are assumed (Resolvd's file isn't written yet): see docs/DECISIONS.md.

CREATE TABLE organizations (
  id                 SERIAL PRIMARY KEY,
  name               VARCHAR(100) NOT NULL,
  slug               VARCHAR(50) NOT NULL UNIQUE,
  next_ticket_number INT NOT NULL DEFAULT 1001,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
