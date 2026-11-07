-- 001_types_and_helpers.sql: shared types and helpers (mirrors Resolvd's 001).
-- ScreenGuide omits Resolvd's ticket_status and ticket_priority enums (no tickets table here).

CREATE TYPE user_role AS ENUM ('end_user', 'technician', 'admin');

-- Shared trigger function: keeps updated_at current on every table that has it.
CREATE FUNCTION set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
