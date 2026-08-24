-- Completa la política de sesiones sin cambiar tokens, cookies ni Argon2id.

ALTER TABLE access_sessions
  ADD COLUMN last_activity_at timestamptz,
  ADD COLUMN idle_expires_at timestamptz;

UPDATE access_sessions
SET last_activity_at = login_at,
    idle_expires_at = LEAST(expires_at, login_at + interval '30 minutes');

ALTER TABLE access_sessions
  ALTER COLUMN last_activity_at SET NOT NULL,
  ALTER COLUMN idle_expires_at SET NOT NULL,
  ADD CONSTRAINT access_session_activity_order CHECK (
    last_activity_at >= login_at AND last_activity_at <= expires_at
  ),
  ADD CONSTRAINT access_session_idle_expiration_order CHECK (
    idle_expires_at >= last_activity_at AND idle_expires_at <= expires_at
  );

CREATE INDEX access_sessions_active_idle_expiry_idx
  ON access_sessions (idle_expires_at)
  WHERE status = 'active';

CREATE TABLE login_rate_limits (
  attempt_key bytea PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT login_rate_limit_key_size CHECK (octet_length(attempt_key) = 32),
  CONSTRAINT login_rate_limit_block_order CHECK (
    blocked_until IS NULL OR blocked_until >= window_started_at
  )
);

CREATE INDEX login_rate_limits_updated_at_idx ON login_rate_limits (updated_at);

COMMENT ON TABLE login_rate_limits IS
  'Rate limiting compartido. attempt_key es SHA-256 de usuario normalizado e IP; no guarda la IP.';

CREATE OR REPLACE VIEW vista_historial_accesos
WITH (security_invoker = true)
AS
SELECT
  u.display_name AS "Usuario",
  to_char(s.login_at AT TIME ZONE 'America/Bogota', 'DD/MM/YYYY HH24:MI:SS') AS "Entrada",
  COALESCE(to_char(s.logout_at AT TIME ZONE 'America/Bogota', 'DD/MM/YYYY HH24:MI:SS'),
    'Sesión abierta') AS "Salida",
  CASE
    WHEN s.status = 'active' AND LEAST(s.expires_at, s.idle_expires_at) <= CURRENT_TIMESTAMP THEN 'Expirada'
    WHEN s.status = 'active' THEN 'Activa'
    WHEN s.status = 'logged_out' THEN 'Cerrada'
    WHEN s.status = 'expired' THEN 'Expirada'
    WHEN s.status = 'revoked' THEN 'Revocada'
  END AS "Estado",
  CASE
    WHEN s.status = 'active' AND LEAST(s.expires_at, s.idle_expires_at) > CURRENT_TIMESTAMP THEN 'En curso'
    ELSE concat(floor(EXTRACT(EPOCH FROM (
      COALESCE(s.logout_at, s.revoked_at, LEAST(s.expires_at, s.idle_expires_at)) - s.login_at
    )) / 60), ' min ', floor(EXTRACT(EPOCH FROM (
      COALESCE(s.logout_at, s.revoked_at, LEAST(s.expires_at, s.idle_expires_at)) - s.login_at
    )))::integer % 60, ' s')
  END AS "Duración"
FROM access_sessions AS s
JOIN users AS u ON u.id = s.user_id
ORDER BY s.login_at DESC;
