-- Fortalece la trazabilidad: conserva el rol histórico y bloquea también TRUNCATE.

ALTER TABLE camera_change_history
  ADD COLUMN actor_role text;

UPDATE camera_change_history AS h
SET actor_role = u.role
FROM users AS u
WHERE u.id = h.actor_user_id;

ALTER TABLE camera_change_history
  ALTER COLUMN actor_role SET NOT NULL,
  ADD CONSTRAINT camera_history_actor_role_valid
    CHECK (actor_role IN ('programmer', 'manager', 'engineer1', 'engineer2'));

CREATE FUNCTION orbinodo_reject_history_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'camera_change_history no puede truncarse';
END;
$$;

CREATE TRIGGER camera_change_history_no_truncate
  BEFORE TRUNCATE ON camera_change_history
  FOR EACH STATEMENT EXECUTE FUNCTION orbinodo_reject_history_truncate();

COMMENT ON COLUMN camera_change_history.actor_role IS
  'Rol del actor en el momento del cambio; no se recalcula desde el usuario actual.';
