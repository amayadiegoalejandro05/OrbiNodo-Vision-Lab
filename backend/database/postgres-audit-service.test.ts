import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { createPostgresAuditService } from './postgres-audit-service';

describe('auditoría PostgreSQL', () => {
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
});
