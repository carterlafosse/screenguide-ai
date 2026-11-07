-- 102_user_preferences.sql: per-user voice, display and consent preferences.
-- Kept separate so the shared users table is never altered.

CREATE TABLE user_preferences (
  organization_id INT NOT NULL REFERENCES organizations(id),
  user_id         INT NOT NULL,
  first_name      TEXT,
  tts_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  speech_rate     NUMERIC(2,1) NOT NULL DEFAULT 1.0 CHECK (speech_rate BETWEEN 0.8 AND 1.2),
  input_mode      TEXT NOT NULL DEFAULT 'handsfree'
                  CHECK (input_mode IN ('handsfree', 'push_to_talk', 'typing')),
  large_text      BOOLEAN NOT NULL DEFAULT FALSE,
  consented_at    TIMESTAMPTZ,
  consent_version TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, user_id),
  FOREIGN KEY (organization_id, user_id) REFERENCES users (organization_id, id)
);

CREATE TRIGGER user_preferences_set_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
