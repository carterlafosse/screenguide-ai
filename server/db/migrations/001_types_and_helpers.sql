-- 001: Enum types and the shared updated_at trigger function.
-- Same as Resolvd's 001 except that ScreenGuide leaves out Resolvd's ticket_status and
-- ticket_priority enums (it has no tickets table; plan Section 4.3).

CREATE TYPE user_role AS ENUM ('end_user', 'technician', 'admin');

-- Attached as a BEFORE UPDATE trigger so updated_at can't be forgotten by application code.
CREATE FUNCTION set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
