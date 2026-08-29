import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { createPostgresAuditService } from './postgres-audit-service';

describe('auditoría PostgreSQL', () => {
  it('returns a terminal state, end time and duration for an expired session', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        id: 'session-1', login_at: new Date('2026-08-14T04:00:00Z'),
        ended_at: new Date('2026-08-14T04:30:00Z'), status: 'expired',
        role: 'engineer1', display_name: 'Ingeniero 1', username: 'Ingeniero 1',
      }] });
    const sessions = await createPostgresAuditService({ query } as unknown as Pool)
      .listAccessSessions();

    expect(sessions).toEqual([expect.objectContaining({
      status: 'expired', endedAt: '2026-08-14T04:30:00.000Z',
      logoutAt: '2026-08-14T04:30:00.000Z', durationSeconds: 1800,
    })]);
  });

  it('agrupa en una sola operación los campos del mismo guardado', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [
      {
        change_set_id: 'change-1', changed_at: new Date('2026-08-14T04:00:00Z'),
        actor_role: 'engineer1', actor_display_name: 'Ingeniero 1',
        camera_id: 'camera-03', camera_name: 'Cámara 3 - Pasillo', asset_code: 'CCTV-003',
        field_name: 'status', old_value: 'Operativa', new_value: 'En mantenimiento',
      },
      {
        change_set_id: 'change-1', changed_at: new Date('2026-08-14T04:00:00Z'),
        actor_role: 'engineer1', actor_display_name: 'Ingeniero 1',
        camera_id: 'camera-03', camera_name: 'Cámara 3 - Pasillo', asset_code: 'CCTV-003',
        field_name: 'notes', old_value: 'Inicial', new_value: 'Revisada',
      },
    ] });
    const service = createPostgresAuditService({ query } as unknown as Pool);

    const changes = await service.listCameraChanges();

    expect(changes).toHaveLength(1);
    expect(changes[0]?.changes.map((item) => item.label)).toEqual([
      'Estado operativo', 'Observaciones',
    ]);
  });

  it('filtra en el servidor por activo y usuario registrado', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [
      {
        change_set_id: 'change-1', changed_at: new Date('2026-08-14T04:00:00Z'),
        actor_role: 'engineer1', actor_username: 'Ingeniero 1', actor_display_name: 'Ingeniero 1',
        camera_id: 'camera-03', camera_name: 'Cámara 3', asset_code: 'CCTV-003',
        field_name: 'status', old_value: 'Operativa', new_value: 'En mantenimiento',
      },
      {
        change_set_id: 'change-2', changed_at: new Date('2026-08-14T05:00:00Z'),
        actor_role: 'engineer2', actor_username: 'Ingeniero 2', actor_display_name: 'Ingeniero 2',
        camera_id: 'camera-04', camera_name: 'Cámara 4', asset_code: 'CCTV-004',
        field_name: 'notes', old_value: 'Inicial', new_value: 'Revisada',
      },
    ] });
    const changes = await createPostgresAuditService({ query } as unknown as Pool)
      .listCameraChanges({ assetCode: 'CCTV-003', username: 'ingeniero 1' });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ cameraId: 'camera-03', actorName: 'Ingeniero 1' });
  });
});
