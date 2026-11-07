-- 111_rls_and_grants.sql: row-level security on every ScreenGuide tenant table, grants to the
-- runtime role, and the narrow SECURITY DEFINER purge functions used by scheduled jobs.

-- ----- Row-level security: policy org_isolation on every tenant table -----
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'org_settings', 'user_preferences', 'invitations', 'assist_sessions', 'session_messages',
    'session_steps', 'step_snapshots', 'escalation_tickets', 'session_feedback', 'usage_events',
    'audit_events', 'integration_settings', 'idempotency_keys', 'ws_tickets'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY org_isolation ON %I '
      'USING (organization_id = current_org_id()) '
      'WITH CHECK (organization_id = current_org_id())', t);
  END LOOP;
END
$$;

-- ----- Table grants to resolvd_app -----
GRANT SELECT, INSERT, UPDATE ON org_settings TO resolvd_app;
GRANT SELECT, INSERT, UPDATE ON user_preferences TO resolvd_app;
GRANT SELECT, INSERT, UPDATE ON invitations TO resolvd_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON assist_sessions TO resolvd_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON session_messages TO resolvd_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON session_steps TO resolvd_app;
GRANT SELECT, INSERT, DELETE ON step_snapshots TO resolvd_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON escalation_tickets TO resolvd_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON session_feedback TO resolvd_app;
GRANT SELECT, INSERT ON usage_events TO resolvd_app;
-- Append-only: no UPDATE or DELETE for the app.
GRANT SELECT, INSERT ON audit_events TO resolvd_app;
GRANT SELECT, INSERT, UPDATE ON integration_settings TO resolvd_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON idempotency_keys TO resolvd_app;
GRANT SELECT, INSERT ON ws_tickets TO resolvd_app;

GRANT USAGE, SELECT ON SEQUENCE
  invitations_id_seq, assist_sessions_id_seq, session_messages_id_seq, session_steps_id_seq,
  step_snapshots_id_seq, escalation_tickets_id_seq, session_feedback_id_seq,
  usage_events_id_seq, audit_events_id_seq
TO resolvd_app;

-- ----- Purge functions (cross-org by design, so SECURITY DEFINER; called by scheduled jobs) -----

-- retention.purge: delete finished sessions older than each org's retention_days.
-- Messages, steps, snapshots, tickets, feedback and ws tickets go with them (ON DELETE CASCADE);
-- usage_events keep their row with session_id cleared. Returns the number of sessions deleted.
CREATE FUNCTION purge_expired_sessions()
RETURNS INT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  DELETE FROM assist_sessions s
  USING org_settings o
  WHERE o.organization_id = s.organization_id
    AND s.status NOT IN ('active', 'paused')
    AND COALESCE(s.ended_at, s.last_activity_at) < NOW() - make_interval(days => o.retention_days);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- idempotency.purge: delete idempotency keys older than p_max_age (24 hours by default).
CREATE FUNCTION purge_idempotency_keys(p_max_age INTERVAL DEFAULT INTERVAL '24 hours')
RETURNS INT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  DELETE FROM idempotency_keys WHERE created_at < NOW() - p_max_age;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Housekeeping: delete WebSocket tickets that expired more than an hour ago.
CREATE FUNCTION purge_expired_ws_tickets()
RETURNS INT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  DELETE FROM ws_tickets WHERE expires_at < NOW() - INTERVAL '1 hour';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION purge_expired_sessions() FROM PUBLIC;
REVOKE ALL ON FUNCTION purge_idempotency_keys(INTERVAL) FROM PUBLIC;
REVOKE ALL ON FUNCTION purge_expired_ws_tickets() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purge_expired_sessions() TO resolvd_app;
GRANT EXECUTE ON FUNCTION purge_idempotency_keys(INTERVAL) TO resolvd_app;
GRANT EXECUTE ON FUNCTION purge_expired_ws_tickets() TO resolvd_app;
