-- 003_users.sql: users (mirrors Resolvd's 003 exactly as given in plan Section 4.1; never altered).
-- Columns are copied verbatim from Section 4.1, including which ones are nullable.

CREATE TABLE users (
  id                    SERIAL PRIMARY KEY,
  organization_id       INT NOT NULL REFERENCES organizations(id),
  name                  VARCHAR(100),
  email                 VARCHAR(255),
  password_hash         TEXT,
  role                  user_role NOT NULL DEFAULT 'end_user',
  department            VARCHAR(100),
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  failed_login_attempts INT NOT NULL DEFAULT 0,
  locked_until          TIMESTAMPTZ,
  last_login_at         TIMESTAMPTZ,
  email_notifications   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id)
);

-- Unique across all organizations.
CREATE UNIQUE INDEX users_email_lower_idx ON users (LOWER(email));

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
