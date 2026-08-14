CREATE VIEW vista_historial_cambios
WITH (security_invoker = true)
AS
SELECT
  h.actor_display_name AS "Ingeniero",
  c.name AS "Cámara",
  c.asset_code AS "Código",
  CASE h.field_name
    WHEN 'status' THEN 'Estado operativo'
    WHEN 'lastMaintenanceOn' THEN 'Último mantenimiento'
    WHEN 'nextMaintenanceOn' THEN 'Próximo mantenimiento'
    WHEN 'responsibleArea' THEN 'Área responsable'
    WHEN 'notes' THEN 'Observaciones'
    ELSE h.field_name
  END AS "Campo",
  h.old_value AS "Valor anterior",
  h.new_value AS "Valor nuevo",
  to_char(h.changed_at AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD HH24:MI:SS') AS "Fecha"
FROM camera_change_history h
JOIN cameras c ON c.id = h.camera_id
ORDER BY h.changed_at DESC, h.id ASC;

COMMENT ON VIEW vista_historial_cambios IS
  'Historial legible de cambios operativos de cámaras para consulta administrativa.';
