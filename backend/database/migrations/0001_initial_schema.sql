-- Esquema inicial de Orbinodo. El runner ejecuta este archivo dentro de una
-- transacción; por eso no contiene BEGIN, COMMIT ni operaciones destructivas.

CREATE TABLE users (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username text NOT NULL,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('programmer', 'manager', 'engineer1', 'engineer2')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT users_username_clean CHECK (username = btrim(username) AND char_length(username) BETWEEN 1 AND 80),
  CONSTRAINT users_display_name_clean CHECK (display_name = btrim(display_name) AND char_length(display_name) BETWEEN 1 AND 120),
  CONSTRAINT users_password_hash_present CHECK (char_length(password_hash) >= 50)
);

CREATE UNIQUE INDEX users_username_lower_unique ON users ((lower(username)));

CREATE TABLE cameras (
  id text PRIMARY KEY,
  asset_code text NOT NULL UNIQUE,
  name text NOT NULL,
  panorama_id text NOT NULL UNIQUE,
  location text NOT NULL,
  brand text NOT NULL,
  model text NOT NULL,
  camera_type text NOT NULL CHECK (camera_type IN ('360°', 'Fija')),
  yaw double precision NOT NULL CHECK (yaw BETWEEN -180 AND 180),
  pitch double precision NOT NULL CHECK (pitch BETWEEN -90 AND 90),
  installed_on date NOT NULL,
  coverage text NOT NULL,
  recording_mode text NOT NULL,
  retention text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT cameras_id_clean CHECK (id = btrim(id) AND char_length(id) BETWEEN 1 AND 80),
  CONSTRAINT cameras_asset_code_clean CHECK (asset_code = btrim(asset_code) AND char_length(asset_code) BETWEEN 1 AND 80)
);

CREATE TABLE camera_operational_state (
  camera_id text PRIMARY KEY REFERENCES cameras(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('Operativa', 'En mantenimiento', 'Fuera de servicio')),
  last_maintenance_on date NOT NULL,
  next_maintenance_on date NOT NULL,
  responsible_area text NOT NULL,
  notes text NOT NULL,
  updated_by bigint REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT camera_maintenance_order CHECK (next_maintenance_on >= last_maintenance_on),
  CONSTRAINT camera_responsible_area_clean CHECK (responsible_area = btrim(responsible_area) AND char_length(responsible_area) BETWEEN 1 AND 100),
  CONSTRAINT camera_notes_clean CHECK (notes = btrim(notes) AND char_length(notes) BETWEEN 1 AND 500)
);

COMMENT ON COLUMN camera_operational_state.updated_by IS
  'Puede ser NULL únicamente para el estado inicial importado antes de cualquier edición.';

CREATE TABLE camera_change_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  change_set_id uuid NOT NULL,
  camera_id text NOT NULL REFERENCES cameras(id) ON DELETE RESTRICT,
  actor_user_id bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_username text NOT NULL,
  actor_display_name text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  field_name text NOT NULL CHECK (field_name IN (
    'status', 'lastMaintenanceOn', 'nextMaintenanceOn', 'responsibleArea', 'notes'
  )),
  old_value text NOT NULL,
  new_value text NOT NULL,
  CONSTRAINT camera_history_value_changed CHECK (old_value IS DISTINCT FROM new_value)
);

CREATE INDEX camera_change_history_camera_time_idx
  ON camera_change_history (camera_id, changed_at DESC);
CREATE INDEX camera_change_history_actor_time_idx
  ON camera_change_history (actor_user_id, changed_at DESC);
CREATE INDEX camera_change_history_change_set_idx
  ON camera_change_history (change_set_id);

CREATE TABLE access_sessions (
  id uuid PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  session_token_hash bytea NOT NULL UNIQUE,
  login_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  logout_at timestamptz,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'logged_out', 'expired', 'revoked')),
  CONSTRAINT access_session_token_hash_size CHECK (octet_length(session_token_hash) = 32),
  CONSTRAINT access_session_expiration_order CHECK (expires_at > login_at),
  CONSTRAINT access_session_logout_order CHECK (logout_at IS NULL OR logout_at >= login_at),
  CONSTRAINT access_session_revocation_order CHECK (revoked_at IS NULL OR revoked_at >= login_at)
);

CREATE INDEX access_sessions_user_login_idx ON access_sessions (user_id, login_at DESC);
CREATE INDEX access_sessions_active_expiry_idx ON access_sessions (expires_at)
  WHERE status = 'active';

COMMENT ON COLUMN access_sessions.session_token_hash IS
  'SHA-256 se usa solo para el token aleatorio de sesión; nunca para contraseñas.';

CREATE FUNCTION orbinodo_set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION orbinodo_set_updated_at();
CREATE TRIGGER cameras_set_updated_at
  BEFORE UPDATE ON cameras
  FOR EACH ROW EXECUTE FUNCTION orbinodo_set_updated_at();
CREATE TRIGGER camera_operational_state_set_updated_at
  BEFORE UPDATE ON camera_operational_state
  FOR EACH ROW EXECUTE FUNCTION orbinodo_set_updated_at();

CREATE FUNCTION orbinodo_reject_history_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'camera_change_history es de solo adición';
END;
$$;

CREATE TRIGGER camera_change_history_append_only
  BEFORE UPDATE OR DELETE ON camera_change_history
  FOR EACH ROW EXECUTE FUNCTION orbinodo_reject_history_mutation();

COMMENT ON TABLE camera_change_history IS
  'Auditoría append-only: la API normal inserta filas y no modifica el pasado.';
