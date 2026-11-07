-- 105_session_messages_steps.sql: transcript messages, guided steps and optional step snapshots.
-- Everything here is deleted with its session (ON DELETE CASCADE).

CREATE TABLE session_messages (
  id              SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(id),
  session_id      INT NOT NULL,
  role            message_role NOT NULL,
  content         TEXT NOT NULL,
  input_mode      input_mode,
  ai_payload      JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (organization_id, session_id)
    REFERENCES assist_sessions (organization_id, id) ON DELETE CASCADE
);

CREATE INDEX session_messages_session_created_idx ON session_messages (session_id, created_at);
CREATE INDEX session_messages_org_idx ON session_messages (organization_id);

CREATE TABLE session_steps (
  id                SERIAL PRIMARY KEY,
  organization_id   INT NOT NULL REFERENCES organizations(id),
  session_id        INT NOT NULL,
  step_index        INT NOT NULL,
  title             TEXT NOT NULL,
  instruction       TEXT NOT NULL,
  expected_outcome  TEXT,
  outcome           step_outcome NOT NULL DEFAULT 'pending',
  attempts          INT NOT NULL DEFAULT 1,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  UNIQUE (organization_id, id),
  UNIQUE (session_id, step_index),
  FOREIGN KEY (organization_id, session_id)
    REFERENCES assist_sessions (organization_id, id) ON DELETE CASCADE
);

CREATE INDEX session_steps_org_idx ON session_steps (organization_id);

-- Only written when org_settings.save_snapshots is on; downscaled JPEG, capped at 80 KB.
CREATE TABLE step_snapshots (
  id              SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(id),
  step_id         INT NOT NULL,
  image           BYTEA NOT NULL CHECK (octet_length(image) <= 81920),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (organization_id, step_id)
    REFERENCES session_steps (organization_id, id) ON DELETE CASCADE
);

CREATE INDEX step_snapshots_org_step_idx ON step_snapshots (organization_id, step_id);
