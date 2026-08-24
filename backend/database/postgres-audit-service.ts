import type { Pool } from 'pg';
import type { AuthRole } from '../domain/auth-service';
import { expireDueSessions } from './postgres-auth-service.js';
import type {
  AccessAuditEntry,
  AuditFieldChange,
  AuditService,
  CameraChangeAuditEntry,
} from '../domain/audit-service';

interface AccessRow {
  id: string;
  login_at: Date;
  logout_at: Date | null;
  role: AuthRole;
  display_name: string;
  username: string;
}

interface ChangeRow {
  change_set_id: string;
  changed_at: Date;
  actor_role: AuthRole;
  actor_display_name: string;
  camera_id: string;
  camera_name: string;
  asset_code: string;
  field_name: AuditFieldChange['field'];
  old_value: string;
  new_value: string;
}

const fieldLabels: Record<AuditFieldChange['field'], string> = {
  status: 'Estado operativo',
  lastMaintenanceOn: 'Último mantenimiento',
  nextMaintenanceOn: 'Próximo mantenimiento',
  responsibleArea: 'Área responsable',
  notes: 'Observaciones',
};

export function createPostgresAuditService(pool: Pool): AuditService {
  return {
    async listAccessSessions(): Promise<AccessAuditEntry[]> {
      await expireDueSessions(pool);
      const result = await pool.query<AccessRow>(`
        SELECT s.id, s.login_at,
          COALESCE(s.logout_at, s.revoked_at,
            CASE WHEN s.status = 'expired'
              THEN LEAST(s.expires_at, s.idle_expires_at) END) AS logout_at,
          u.role, u.display_name, u.username
        FROM access_sessions s
        JOIN users u ON u.id = s.user_id
        ORDER BY s.login_at DESC
        LIMIT 500
      `);
      return result.rows.map((row) => ({
        id: row.id,
        timestamp: row.login_at.toISOString(),
        ...(row.logout_at ? {
          logoutAt: row.logout_at.toISOString(),
          durationSeconds: Math.max(0, Math.floor(
            (row.logout_at.getTime() - row.login_at.getTime()) / 1000,
          )),
        } : {}),
        role: row.role,
        displayName: row.display_name,
        username: row.username,
      }));
    },

    async listCameraChanges(): Promise<CameraChangeAuditEntry[]> {
      const result = await pool.query<ChangeRow>(`
        SELECT h.change_set_id, h.changed_at, u.role AS actor_role,
          h.actor_display_name, h.camera_id, c.name AS camera_name,
          c.asset_code, h.field_name, h.old_value, h.new_value
        FROM camera_change_history h
        JOIN users u ON u.id = h.actor_user_id
        JOIN cameras c ON c.id = h.camera_id
        ORDER BY h.changed_at DESC, h.id ASC
        LIMIT 1000
      `);
      const grouped = new Map<string, CameraChangeAuditEntry>();
      for (const row of result.rows) {
        let entry = grouped.get(row.change_set_id);
        if (!entry) {
          entry = {
            id: row.change_set_id,
            timestamp: row.changed_at.toISOString(),
            actorRole: row.actor_role,
            actorName: row.actor_display_name,
            cameraId: row.camera_id,
            cameraName: row.camera_name,
            assetCode: row.asset_code,
            changes: [],
          };
          grouped.set(row.change_set_id, entry);
        }
        entry.changes.push({
          field: row.field_name,
          label: fieldLabels[row.field_name],
          before: row.old_value,
          after: row.new_value,
        });
      }
      return [...grouped.values()];
    },
  };
}
