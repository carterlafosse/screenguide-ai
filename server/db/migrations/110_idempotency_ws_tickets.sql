-- 110_idempotency_ws_tickets.sql: idempotency keys for unsafe POSTs, and single-use WebSocket tickets.

CREATE TABLE idempotency_keys (
  organization_id INT NOT NULL REFERENCES organizations(id),
  user_id         INT NOT NULL,
  key             UUID NOT NULL,
  request_hash    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  response_code   INT,
  response_body   JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, user_id, key),
  FOREIGN KEY (organization_id, user_id) REFERENCES users (organization_id, id)
);

CREATE INDEX idempotency_keys_created_idx ON idempotency_keys (created_at);

-- token_hash = SHA-256 of a random 32-byte token; tickets live 60 s and are consumed once.
CREATE TABLE ws_tickets (
  token_hash      TEXT PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(id),
  user_id         INT NOT NULL,
  session_id      INT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (organization_id, user_id) REFERENCES users (organization_id, id),
  FOREIGN KEY (organization_id, session_id)
    REFERENCES assist_sessions (organization_id, id) ON DELETE CASCADE
);

CREATE INDEX ws_tickets_expires_idx ON ws_tickets (expires_at);

-- The WebSocket upgrade happens before the org is known, so consuming a ticket runs as the owner.
-- Atomic: returns one row the first time a valid, unexpired ticket is used, and nothing after.
CREATE FUNCTION consume_ws_ticket(p_token_hash TEXT)
RETURNS TABLE (organization_id INT, user_id INT, session_id INT)
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE ws_tickets t
  SET used_at = NOW()
  WHERE t.token_hash = p_token_hash
    AND t.used_at IS NULL
    AND t.expires_at > NOW()
  RETURNING t.organization_id, t.user_id, t.session_id
$$;

REVOKE ALL ON FUNCTION consume_ws_ticket(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION consume_ws_ticket(TEXT) TO resolvd_app;
