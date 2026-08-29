-- Preserves accurate administrative reporting when no API request has run yet.

UPDATE access_sessions
SET status = 'expired',
    ended_at = COALESCE(ended_at, LEAST(expires_at, idle_expires_at))
WHERE status = 'active'
  AND LEAST(expires_at, idle_expires_at) <= CURRENT_TIMESTAMP;

DROP VIEW vista_historial_accesos;

CREATE VIEW vista_historial_accesos
WITH (security_invoker = true)
AS
SELECT
  u.display_name AS usuario,
  to_char(s.login_at AT TIME ZONE 'America/Bogota', 'DD/MM/YYYY HH24:MI:SS') AS entrada,
  COALESCE(to_char(
    CASE WHEN s.status = 'active' AND LEAST(s.expires_at, s.idle_expires_at) <= CURRENT_TIMESTAMP
      THEN LEAST(s.expires_at, s.idle_expires_at)
      ELSE s.ended_at END AT TIME ZONE 'America/Bogota',
    'DD/MM/YYYY HH24:MI:SS'
  ), 'Sesion abierta') AS salida,
  CASE
    WHEN s.status = 'active' AND LEAST(s.expires_at, s.idle_expires_at) <= CURRENT_TIMESTAMP THEN 'Expirada'
    WHEN s.status = 'active' THEN 'Activa'
    WHEN s.status = 'logged_out' THEN 'Cerrada'
    WHEN s.status = 'expired' THEN 'Expirada'
    WHEN s.status = 'revoked' THEN 'Revocada'
  END AS estado,
  CASE
    WHEN s.status = 'active' AND LEAST(s.expires_at, s.idle_expires_at) > CURRENT_TIMESTAMP THEN 'En curso'
    ELSE concat(
      floor(EXTRACT(EPOCH FROM (
        COALESCE(s.ended_at, LEAST(s.expires_at, s.idle_expires_at)) - s.login_at
      )) / 60), ' min ',
      floor(EXTRACT(EPOCH FROM (
        COALESCE(s.ended_at, LEAST(s.expires_at, s.idle_expires_at)) - s.login_at
      )))::integer % 60, ' s'
    )
  END AS duracion
FROM access_sessions AS s
JOIN users AS u ON u.id = s.user_id
ORDER BY s.login_at DESC;
