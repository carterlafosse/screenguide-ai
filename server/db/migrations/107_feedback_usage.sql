-- 107_feedback_usage.sql: end-of-session ratings and per-call usage/cost/latency events.

CREATE TABLE session_feedback (
  id              SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(id),
  session_id      INT NOT NULL UNIQUE,
  user_id         INT NOT NULL,
  rating          INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (organization_id, session_id)
    REFERENCES assist_sessions (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, user_id) REFERENCES users (organization_id, id)
);

CREATE INDEX session_feedback_org_created_idx ON session_feedback (organization_id, created_at);

-- Usage rows outlive their session (cost history): deleting a session only clears session_id.
CREATE TABLE usage_events (
  id                BIGSERIAL PRIMARY KEY,
  organization_id   INT NOT NULL REFERENCES organizations(id),
  session_id        INT,
  user_id           INT,
  type              usage_type NOT NULL,
  model             TEXT,
  input_tokens      INT,
  output_tokens     INT,
  cache_read_tokens INT,
  latency_ms        INT,
  tts_chars         INT,
  stt_seconds       NUMERIC,
  meta              JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (organization_id, session_id)
    REFERENCES assist_sessions (organization_id, id) ON DELETE SET NULL (session_id),
  FOREIGN KEY (organization_id, user_id) REFERENCES users (organization_id, id)
);

CREATE INDEX usage_events_org_created_idx ON usage_events (organization_id, created_at);
CREATE INDEX usage_events_session_idx ON usage_events (session_id);
