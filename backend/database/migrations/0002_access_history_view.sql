-- Presentación legible del historial técnico de sesiones para pgAdmin.
CREATE VIEW vista_historial_accesos
WITH (security_invoker = true)
AS
SELECT
  u.display_name AS "Usuario",
  to_char(
    s.login_at AT TIME ZONE 'America/Bogota',
    'DD/MM/YYYY HH24:MI:SS'
  ) AS "Entrada",
  COALESCE(
    to_char(s.logout_at AT TIME ZONE 'America/Bogota', 'DD/MM/YYYY HH24:MI:SS'),
    'Sesión abierta'
  ) AS "Salida",
  CASE
    WHEN s.status = 'active' AND s.expires_at <= CURRENT_TIMESTAMP THEN 'Expirada'
    WHEN s.status = 'active' THEN 'Activa'
    WHEN s.status = 'logged_out' THEN 'Cerrada'
    WHEN s.status = 'expired' THEN 'Expirada'
    WHEN s.status = 'revoked' THEN 'Revocada'
  END AS "Estado",
  CASE
    WHEN s.status = 'active' AND s.expires_at > CURRENT_TIMESTAMP THEN 'En curso'
    ELSE concat(
      floor(EXTRACT(EPOCH FROM (
        COALESCE(s.logout_at, s.revoked_at, s.expires_at) - s.login_at
      )) / 60),
      ' min ',
      floor(EXTRACT(EPOCH FROM (
        COALESCE(s.logout_at, s.revoked_at, s.expires_at) - s.login_at
      )))::integer % 60,
      ' s'
    )
  END AS "Duración"
FROM access_sessions AS s
JOIN users AS u ON u.id = s.user_id
ORDER BY s.login_at DESC;

COMMENT ON VIEW vista_historial_accesos IS
  'Historial de accesos en hora de Bogotá, con estado y duración legibles.';
