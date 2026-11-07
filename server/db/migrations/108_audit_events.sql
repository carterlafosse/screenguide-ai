-- 108_audit_events.sql: append-only audit log. The app role gets SELECT and INSERT only (see 111).

CREATE TABLE audit_events (
  id              BIGSERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(id),
  actor_id        INT,
  action          TEXT NOT NULL,
  entity_type     TEXT,
  entity_id       TEXT,
  meta            JSONB,
  request_id      UUID,
  ip              INET,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (organization_id, actor_id) REFERENCES users (organization_id, id)
);

CREATE INDEX audit_events_org_created_idx ON audit_events (organization_id, created_at DESC);
CREATE INDEX audit_events_org_action_idx ON audit_events (organization_id, action);
