-- 109_integrations.sql: per-org Resolvd connector settings. The API key is AES-256-GCM encrypted
-- (iv:authTag:ciphertext) and never returned; only key_last4 is shown.

CREATE TABLE integration_settings (
  organization_id   INT PRIMARY KEY REFERENCES organizations(id),
  provider          TEXT NOT NULL DEFAULT 'resolvd' CHECK (provider = 'resolvd'),
  base_url          TEXT,
  api_key_encrypted TEXT,
  key_last4         TEXT,
  enabled           BOOLEAN NOT NULL DEFAULT FALSE,
  last_success_at   TIMESTAMPTZ,
  last_error        TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER integration_settings_set_updated_at
  BEFORE UPDATE ON integration_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
