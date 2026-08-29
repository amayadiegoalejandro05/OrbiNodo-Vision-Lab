-- Normalizes session completion without changing opaque-token authentication.

ALTER TABLE access_sessions
  ADD COLUMN ended_at timestamptz;

UPDATE access_sessions
SET ended_at = COALESCE(
  logout_at,
  revoked_at,
  CASE WHEN status = 'expired' THEN LEAST(expires_at, idle_expires_at) END
)
WHERE ended_at IS NULL;

ALTER TABLE access_sessions
  ADD CONSTRAINT access_session_end_order CHECK (
    ended_at IS NULL OR ended_at >= login_at
  ),
  ADD CONSTRAINT access_session_terminal_end CHECK (
    (status = 'active' AND ended_at IS NULL)
    OR (status <> 'active' AND ended_at IS NOT NULL)
  );

CREATE INDEX access_sessions_login_history_idx
  ON access_sessions (login_at DESC);

-- CREATE OR REPLACE VIEW cannot rename its columns. This administrative view is
-- recreated inside the migration transaction with stable ASCII column names.
DROP VIEW vista_historial_accesos;

CREATE VIEW vista_historial_accesos
WITH (security_invoker = true)
AS
SELECT
  u.display_name AS usuario,
  to_char(s.login_at AT TIME ZONE 'America/Bogota', 'DD/MM/YYYY HH24:MI:SS') AS entrada,
  COALESCE(
    to_char(s.ended_at AT TIME ZONE 'America/Bogota', 'DD/MM/YYYY HH24:MI:SS'),
    'Sesion abierta'
  ) AS salida,
  CASE
    WHEN s.status = 'active' THEN 'Activa'
    WHEN s.status = 'logged_out' THEN 'Cerrada'
    WHEN s.status = 'expired' THEN 'Expirada'
    WHEN s.status = 'revoked' THEN 'Revocada'
  END AS estado,
  CASE
    WHEN s.ended_at IS NULL THEN 'En curso'
    ELSE concat(
      floor(EXTRACT(EPOCH FROM (s.ended_at - s.login_at)) / 60), ' min ',
      floor(EXTRACT(EPOCH FROM (s.ended_at - s.login_at)))::integer % 60, ' s'
    )
  END AS duracion
FROM access_sessions AS s
JOIN users AS u ON u.id = s.user_id
ORDER BY s.login_at DESC;

COMMENT ON COLUMN access_sessions.ended_at IS
  'Terminal timestamp for logout, expiration or revocation; NULL only when active.';
