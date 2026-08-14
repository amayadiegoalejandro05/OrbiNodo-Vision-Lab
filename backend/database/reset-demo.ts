import type { PoolClient } from 'pg';
import { demoSecurityCameras } from '../../src/data/demo-cameras';

export interface ResetResult {
  users: number;
  cameras: number;
  operationalStates: number;
  accessSessions: number;
  cameraChanges: number;
}

export async function resetDemoData(client: PoolClient): Promise<ResetResult> {
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [1_849_042_028]);
    await client.query('TRUNCATE access_sessions, camera_change_history RESTART IDENTITY');
    for (const camera of demoSecurityCameras) {
      const updated = await client.query({
        text: `UPDATE camera_operational_state SET
          status = $2, last_maintenance_on = $3, next_maintenance_on = $4,
          responsible_area = $5, notes = $6, updated_by = NULL,
          updated_at = CURRENT_TIMESTAMP WHERE camera_id = $1`,
        values: [
          camera.id, camera.status, camera.lastMaintenanceOn,
          camera.nextMaintenanceOn, camera.responsibleArea, camera.notes,
        ],
      });
      if (updated.rowCount !== 1) {
        throw new Error('Falta el estado inicial de ' + camera.id + '.');
      }
    }
    const result = await readDatabaseState(client);
    if (result.users !== 4 || result.cameras !== 10 || result.operationalStates !== 10
        || result.accessSessions !== 0 || result.cameraChanges !== 0) {
      throw new Error('La base no quedó en el estado inicial esperado.');
    }
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function readDatabaseState(client: PoolClient): Promise<ResetResult> {
  const result = await client.query<ResetResult>(`SELECT
    (SELECT count(*)::int FROM users) AS users,
    (SELECT count(*)::int FROM cameras) AS cameras,
    (SELECT count(*)::int FROM camera_operational_state) AS "operationalStates",
    (SELECT count(*)::int FROM access_sessions) AS "accessSessions",
    (SELECT count(*)::int FROM camera_change_history) AS "cameraChanges"`);
  const row = result.rows[0];
  if (!row) throw new Error('No fue posible verificar el reinicio.');
  return row;
}
