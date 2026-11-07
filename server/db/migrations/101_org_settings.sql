-- 101_org_settings.sql: per-organization ScreenGuide settings (one row per org, made at registration).
-- Kept separate so the shared organizations table is never altered.

CREATE TABLE org_settings (
  organization_id       INT PRIMARY KEY REFERENCES organizations(id),
  plan                  org_plan NOT NULL DEFAULT 'free',
  retention_days        INT NOT NULL DEFAULT 90 CHECK (retention_days IN (30, 90, 365)),
  save_snapshots        BOOLEAN NOT NULL DEFAULT FALSE,
  it_contact_email      TEXT,
  auto_push_escalations BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER org_settings_set_updated_at
  BEFORE UPDATE ON org_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
