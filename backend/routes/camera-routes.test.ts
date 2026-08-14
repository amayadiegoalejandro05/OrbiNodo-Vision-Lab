import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiApp } from '../app';
import type { AuthService, AuthUser } from '../domain/auth-service';
import type { CameraRecord, CameraService } from '../domain/camera-service';

const apps: Array<ReturnType<typeof createApiApp>> = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

const engineer: AuthUser = {
  username: 'Ingeniero 1', displayName: 'Ingeniero 1', role: 'engineer1',
};
const camera: CameraRecord = {
  id: 'camera-01', assetCode: 'CCTV-001', name: 'Cámara 1',
  panoramaId: 'sotano-01', location: 'Sótano', brand: 'Demo', model: 'X1',
  type: '360°', yaw: 10, pitch: 5, installedOn: '2025-01-01',
  coverage: 'Acceso', recordingMode: 'Continua', retention: '30 días',
  status: 'Operativa', lastMaintenanceOn: '2026-01-01',
  nextMaintenanceOn: '2026-06-01', responsibleArea: 'Seguridad', notes: 'Inicial',
};

function buildApp(user: AuthUser | null, cameraService: CameraService) {
  const authService: AuthService = {
    login: async () => null,
    getSession: async () => user,
    logout: async () => undefined,
  };
  const app = createApiApp({
    authService, cameraService, cookieName: 'orbinodo_session',
    auditService: { listAccessSessions: async () => [], listCameraChanges: async () => [] },
    cookieSecure: false, sessionHours: 8,
    healthProbe: { readServerTime: async () => new Date() },
  });
  apps.push(app);
  return app;
}

function service(overrides: Partial<CameraService> = {}): CameraService {
  return {
    listCameras: async () => [camera],
    updateOperations: async () => null,
    ...overrides,
  };
}

const cookie = { cookie: `orbinodo_session=${'a'.repeat(43)}` };

describe('rutas de cámaras', () => {
  it('exige sesión y permite leer cámaras a un perfil autenticado', async () => {
    const denied = await buildApp(null, service()).inject({
      method: 'GET', url: '/api/cameras', headers: cookie,
    });
    expect(denied.statusCode).toBe(401);
    const allowed = await buildApp(engineer, service()).inject({
      method: 'GET', url: '/api/cameras', headers: cookie,
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json()).toEqual({ cameras: [camera] });
  });

  it('rechaza PATCH del Jefe antes de llamar al servicio', async () => {
    const update = vi.fn<CameraService['updateOperations']>();
    const manager = { ...engineer, username: 'Jefe', displayName: 'Jefe', role: 'manager' as const };
    const app = buildApp(manager, service({ updateOperations: update }));
    const response = await app.inject({
      method: 'PATCH', url: '/api/cameras/camera-01/operations',
      headers: cookie, payload: camera,
    });
    expect(response.statusCode).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it('entrega una actualización válida del Ingeniero al servicio', async () => {
    const operations = {
      status: 'En mantenimiento' as const,
      lastMaintenanceOn: '2026-02-01', nextMaintenanceOn: '2026-07-01',
      responsibleArea: 'Mantenimiento', notes: 'Revisión programada',
    };
    const update = vi.fn<CameraService['updateOperations']>(async () => ({
      camera: { ...camera, ...operations }, changedFields: ['status'],
    }));
    const app = buildApp(engineer, service({ updateOperations: update }));
    const response = await app.inject({
      method: 'PATCH', url: '/api/cameras/camera-01/operations',
      headers: cookie, payload: operations,
    });
    expect(response.statusCode).toBe(200);
    expect(update).toHaveBeenCalledWith('camera-01', engineer, operations);
    expect(response.json().changedFields).toEqual(['status']);
  });

  it('rechaza fechas imposibles antes de consultar PostgreSQL', async () => {
    const update = vi.fn<CameraService['updateOperations']>();
    const app = buildApp(engineer, service({ updateOperations: update }));
    const response = await app.inject({
      method: 'PATCH', url: '/api/cameras/camera-01/operations', headers: cookie,
      payload: {
        status: 'Operativa', lastMaintenanceOn: '2026-02-31',
        nextMaintenanceOn: '2026-07-01', responsibleArea: 'Seguridad', notes: 'Nota',
      },
    });
    expect(response.statusCode).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
});
