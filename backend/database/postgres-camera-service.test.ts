import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { CameraActorNotAllowedError } from '../domain/camera-service.js';
import { createPostgresCameraService } from './postgres-camera-service';

const row = {
  id: 'camera-01', asset_code: 'CCTV-001', name: 'Cámara 1',
  panorama_id: 'sotano-01', location: 'Sótano', brand: 'Demo', model: 'X1',
  camera_type: '360°', yaw: 10, pitch: 5,
  installed_on: new Date('2025-01-01T00:00:00.000Z'),
  coverage: 'Acceso', recording_mode: 'Continua', retention: '30 días',
  status: 'Operativa', last_maintenance_on: '2026-01-01',
  next_maintenance_on: '2026-06-01', responsible_area: 'Seguridad', notes: 'Inicial',
};

const actor = {
  username: 'Ingeniero 1', displayName: 'Ingeniero 1', role: 'engineer1' as const,
};

describe('transacción operativa PostgreSQL', () => {
  it('consulta una cámara por identificador con parámetros', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [row] });
    const service = createPostgresCameraService({ query } as unknown as Pool);
    const result = await service.getCamera('camera-01');
    expect(query.mock.calls[0]?.[0]).toMatchObject({ values: ['camera-01'] });
    expect(result?.id).toBe('camera-01');
  });

  it('keeps SQL-looking camera IDs as bound data, never as query text', async () => {
    const injectedId = 'camera-01; SELECT 1';
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const service = createPostgresCameraService({ query } as unknown as Pool);
    await service.getCamera(injectedId);
    const request = query.mock.calls[0]?.[0];
    expect(request).toMatchObject({ values: [injectedId] });
    expect(request.text).toContain('c.id = $1');
    expect(request.text).not.toContain(injectedId);
  });

  it('guarda estado e historial antes de confirmar', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        id: '7', username: actor.username, display_name: actor.displayName, role: actor.role,
      }] })
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const release = vi.fn();
    const pool = {
      connect: async () => ({ query, release }),
    } as unknown as Pool;
    const service = createPostgresCameraService(pool);
    const result = await service.updateOperations('camera-01', actor, {
      status: 'En mantenimiento', lastMaintenanceOn: '2026-01-01',
      nextMaintenanceOn: '2026-06-01', responsibleArea: 'Seguridad',
      notes: 'Revisión abierta',
    });
    const sql = query.mock.calls.map(([value]) =>
      typeof value === 'string' ? value : value.text,
    );
    expect(sql[0]).toBe('BEGIN');
    expect(sql.at(-1)).toBe('COMMIT');
    expect(sql.filter((text) => text.includes('INSERT INTO camera_change_history')))
      .toHaveLength(2);
    expect(result?.changedFields).toEqual(['status', 'notes']);
    expect(result?.camera.status).toBe('En mantenimiento');
    expect(result?.camera.installedOn).toBe('2025-01-01');
    expect(release).toHaveBeenCalledOnce();
  });
  it('rechaza a un actor ya no autorizado sin actualizar la cámara', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const release = vi.fn();
    const pool = { connect: async () => ({ query, release }) } as unknown as Pool;

    await expect(createPostgresCameraService(pool).updateOperations('camera-01', actor, {
      status: 'En mantenimiento', lastMaintenanceOn: '2026-01-01',
      nextMaintenanceOn: '2026-06-01', responsibleArea: 'Seguridad', notes: 'Prueba',
    })).rejects.toBeInstanceOf(CameraActorNotAllowedError);

    expect(query).toHaveBeenCalledTimes(3);
    expect(release).toHaveBeenCalledOnce();
  });
});
