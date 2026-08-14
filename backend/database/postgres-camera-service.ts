import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type {
  CameraOperationsUpdate, CameraRecord, CameraService, CameraUpdateResult,
} from '../domain/camera-service';
import { CameraActorNotAllowedError } from '../domain/camera-service.js';

interface CameraRow {
  id: string;
  asset_code: string;
  name: string;
  panorama_id: string;
  location: string;
  brand: string;
  model: string;
  camera_type: '360°' | 'Fija';
  yaw: number;
  pitch: number;
  installed_on: string | Date;
  coverage: string;
  recording_mode: string;
  retention: string;
  status: CameraOperationsUpdate['status'];
  last_maintenance_on: string | Date;
  next_maintenance_on: string | Date;
  responsible_area: string;
  notes: string;
}

const CAMERA_SELECT = `SELECT c.id, c.asset_code, c.name, c.panorama_id,
  c.location, c.brand, c.model, c.camera_type, c.yaw, c.pitch,
  c.installed_on, c.coverage, c.recording_mode, c.retention,
  o.status, o.last_maintenance_on, o.next_maintenance_on,
  o.responsible_area, o.notes
  FROM cameras c JOIN camera_operational_state o ON o.camera_id = c.id`;

function dateOnly(value: string | Date): string {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : value.slice(0, 10);
}

function cameraRecord(row: CameraRow): CameraRecord {
  return {
    id: row.id, assetCode: row.asset_code, name: row.name,
    panoramaId: row.panorama_id, location: row.location, brand: row.brand,
    model: row.model, type: row.camera_type, yaw: row.yaw, pitch: row.pitch,
    installedOn: dateOnly(row.installed_on), coverage: row.coverage,
    recordingMode: row.recording_mode, retention: row.retention,
    status: row.status, lastMaintenanceOn: dateOnly(row.last_maintenance_on),
    nextMaintenanceOn: dateOnly(row.next_maintenance_on),
    responsibleArea: row.responsible_area, notes: row.notes,
  };
}

const operationFields: Array<keyof CameraOperationsUpdate> = [
  'status', 'lastMaintenanceOn', 'nextMaintenanceOn', 'responsibleArea', 'notes',
];

interface ActorRow { id: string; username: string; display_name: string }

async function lockActor(client: PoolClient, username: string): Promise<ActorRow | null> {
  const result = await client.query<ActorRow>({
    text: `SELECT id, username, display_name FROM users
      WHERE lower(username) = lower($1) AND is_active = true
        AND role IN ('engineer1', 'engineer2') FOR UPDATE`,
    values: [username],
  });
  return result.rows[0] ?? null;
}

export function createPostgresCameraService(pool: Pool): CameraService {
  async function listCameras(): Promise<CameraRecord[]> {
    const result = await pool.query<CameraRow>(CAMERA_SELECT + ' ORDER BY c.asset_code');
    return result.rows.map(cameraRecord);
  }

  async function updateOperations(
    cameraId: string,
    actor: Parameters<CameraService['updateOperations']>[1],
    update: CameraOperationsUpdate,
  ): Promise<CameraUpdateResult | null> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const activeActor = await lockActor(client, actor.username);
      if (!activeActor) throw new CameraActorNotAllowedError();
      const found = await client.query<CameraRow>({
        text: CAMERA_SELECT + ' WHERE c.id = $1 FOR UPDATE OF o',
        values: [cameraId],
      });
      const row = found.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return null;
      }
      const current = cameraRecord(row);
      const changedFields = operationFields.filter(
        (field) => current[field] !== update[field],
      );
      if (changedFields.length === 0) {
        await client.query('COMMIT');
        return { camera: current, changedFields };
      }
      await client.query({
        text: `UPDATE camera_operational_state SET
          status = $2, last_maintenance_on = $3, next_maintenance_on = $4,
          responsible_area = $5, notes = $6, updated_by = $7
          WHERE camera_id = $1`,
        values: [
          cameraId, update.status, update.lastMaintenanceOn,
          update.nextMaintenanceOn, update.responsibleArea, update.notes,
          activeActor.id,
        ],
      });
      const changeSetId = randomUUID();
      for (const field of changedFields) {
        await client.query({
          text: `INSERT INTO camera_change_history
            (change_set_id, camera_id, actor_user_id, actor_username,
             actor_display_name, field_name, old_value, new_value)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          values: [
            changeSetId, cameraId, activeActor.id, activeActor.username,
            activeActor.display_name, field, current[field], update[field],
          ],
        });
      }
      await client.query('COMMIT');
      return { camera: { ...current, ...update }, changedFields };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  return { listCameras, updateOperations };
}
