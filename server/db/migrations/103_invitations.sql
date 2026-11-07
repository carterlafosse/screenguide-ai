-- 103_invitations.sql: admin invitations and the definer function that accepts one.

CREATE TABLE invitations (
  id              SERIAL PRIMARY KEY,
  organization_id INT NOT NULL REFERENCES organizations(id),
  email           VARCHAR(255) NOT NULL,
  role            user_role NOT NULL DEFAULT 'end_user',
  token_hash      TEXT NOT NULL UNIQUE,
  invited_by      INT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  accepted_at     TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, invited_by) REFERENCES users (organization_id, id)
);

-- At most one open invitation per email per org.
CREATE UNIQUE INDEX invitations_open_email_idx
  ON invitations (organization_id, LOWER(email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX invitations_org_created_idx ON invitations (organization_id, created_at DESC);

-- The person accepting has no org context yet, so acceptance runs as the owner.
-- Creates the user in the invitation's org and marks the invitation accepted, atomically.
-- Raises INVITATION_INVALID if the token is unknown, used, revoked or expired.
-- A duplicate email raises the normal unique violation (23505) from users_email_lower_idx.
CREATE FUNCTION accept_invitation(p_token_hash TEXT, p_name TEXT, p_password_hash TEXT)
RETURNS TABLE (user_id INT, organization_id INT, role user_role)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv invitations%ROWTYPE;
  v_user_id INT;
BEGIN
  SELECT * INTO v_inv
  FROM invitations i
  WHERE i.token_hash = p_token_hash
    AND i.accepted_at IS NULL
    AND i.revoked_at IS NULL
    AND i.expires_at > NOW()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVITATION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO users (organization_id, name, email, password_hash, role)
  VALUES (v_inv.organization_id, p_name, LOWER(v_inv.email), p_password_hash, v_inv.role)
  RETURNING id INTO v_user_id;

  UPDATE invitations SET accepted_at = NOW() WHERE id = v_inv.id;

  RETURN QUERY SELECT v_user_id, v_inv.organization_id, v_inv.role;
END;
$$;

REVOKE ALL ON FUNCTION accept_invitation(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION accept_invitation(TEXT, TEXT, TEXT) TO resolvd_app;
