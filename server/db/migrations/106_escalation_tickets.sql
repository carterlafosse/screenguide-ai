-- 106_escalation_tickets.sql: AI-written escalation ticket (one per session) and its Resolvd push state.

CREATE TABLE escalation_tickets (
  id                 SERIAL PRIMARY KEY,
  organization_id    INT NOT NULL REFERENCES organizations(id),
  session_id         INT NOT NULL UNIQUE,
  title              TEXT NOT NULL,
  summary            TEXT NOT NULL,
  environment        JSONB NOT NULL DEFAULT '{}',
  steps_tried        JSONB NOT NULL DEFAULT '[]',
  current_state      TEXT,
  suspected_cause    TEXT,
  urgency            ticket_urgency NOT NULL DEFAULT 'normal',
  suggested_priority TEXT NOT NULL DEFAULT 'medium'
                     CHECK (suggested_priority IN ('low', 'medium', 'high', 'critical')),
  category_hint      TEXT,
  emailed_to         TEXT[] NOT NULL DEFAULT '{}',
  push_status        push_status NOT NULL DEFAULT 'not_pushed',
  push_attempts      INT NOT NULL DEFAULT 0,
  push_error         TEXT,
  remote_id          TEXT,
  display_id         TEXT,
  pushed_at          TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, session_id)
    REFERENCES assist_sessions (organization_id, id) ON DELETE CASCADE
);

CREATE INDEX escalation_tickets_org_created_idx ON escalation_tickets (organization_id, created_at DESC);

CREATE TRIGGER escalation_tickets_set_updated_at
  BEFORE UPDATE ON escalation_tickets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
