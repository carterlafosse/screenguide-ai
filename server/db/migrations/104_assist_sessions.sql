-- 104_assist_sessions.sql: one row per help session; the server's source of truth for session state.

CREATE TABLE assist_sessions (
  id                         SERIAL PRIMARY KEY,
  organization_id            INT NOT NULL REFERENCES organizations(id),
  user_id                    INT NOT NULL,
  status                     assist_session_status NOT NULL DEFAULT 'active',
  title                      TEXT,
  category                   assist_category,
  model_tier                 model_tier NOT NULL DEFAULT 'fast',
  running_summary            TEXT,
  current_step               JSONB,
  consecutive_low_confidence INT NOT NULL DEFAULT 0,
  turn_count                 INT NOT NULL DEFAULT 0,
  ai_call_count              INT NOT NULL DEFAULT 0,
  input_modes_used           TEXT[] NOT NULL DEFAULT '{}',
  client_info                JSONB,
  started_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at                   TIMESTAMPTZ,
  duration_seconds           INT,
  final_summary              TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, user_id) REFERENCES users (organization_id, id)
);

CREATE INDEX assist_sessions_org_started_idx ON assist_sessions (organization_id, started_at DESC);
CREATE INDEX assist_sessions_org_user_started_idx
  ON assist_sessions (organization_id, user_id, started_at DESC);
-- Used by the abandon sweeper.
CREATE INDEX assist_sessions_open_activity_idx
  ON assist_sessions (last_activity_at)
  WHERE status IN ('active', 'paused');

CREATE TRIGGER assist_sessions_set_updated_at
  BEFORE UPDATE ON assist_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
