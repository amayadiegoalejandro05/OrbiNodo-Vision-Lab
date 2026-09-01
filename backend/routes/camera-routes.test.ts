import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiApp } from '../app';
import type { AuthService, AuthUser } from '../domain/auth-service';
import { CameraVersionConflictError } from '../domain/camera-service.js';
import type { CameraRecord, CameraService } from '../domain/camera-service';

const apps: Array<ReturnType<typeof createApiApp>> = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

const engineer: AuthUser = {
  username: 'Ingeniero 1', displayName: 'Ingeniero 1', role: 'engineer1',
};
const camera: CameraRecord = {
  id: 'camera-01',
  version: 0, assetCode: 'CCTV-001', name: 'Cámara 1',
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
    getCamera: async () => camera,
    updateOperations: async () => null,
    ...overrides,
  };
}

const cookie = { cookie: `orbinodo_session=${'a'.repeat(43)}` };
const operations = {
  status: 'En mantenimiento' as const,
  expectedVersion: 0,
  lastMaintenanceOn: '2026-02-01', nextMaintenanceOn: '2026-07-01',
  responsibleArea: 'Mantenimiento', notes: 'Revisión programada',
};

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

  it('permite consultar cámaras a los cuatro roles autenticados', async () => {
    const users: AuthUser[] = [
      { username: 'Orbinodo', displayName: 'Orbinodo', role: 'programmer' },
      { username: 'Jefe', displayName: 'Jefe', role: 'manager' }, engineer,
      { username: 'Ingeniero 2', displayName: 'Ingeniero 2', role: 'engineer2' },
    ];
    for (const user of users) {
      const response = await buildApp(user, service()).inject({
        method: 'GET', url: '/api/cameras/camera-01', headers: cookie,
      });
      expect(response.statusCode, user.role).toBe(200);
    }
  });

  it('consulta una cámara individual autenticada', async () => {
    const response = await buildApp(engineer, service()).inject({
      method: 'GET', url: '/api/cameras/camera-01', headers: cookie,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ camera });
  });

  it('responde 404 estable para una cámara inexistente', async () => {
    const app = buildApp(engineer, service({ getCamera: async () => null }));
    const response = await app.inject({
      method: 'GET', url: '/api/cameras/camera-99', headers: cookie,
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: 'CAMERA_NOT_FOUND', message: 'La cámara solicitada no existe.',
    });
  });

  it('responde 400 para un identificador mal formado', async () => {
    const response = await buildApp(engineer, service()).inject({
      method: 'GET', url: '/api/cameras/%20', headers: cookie,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('VALIDATION_ERROR');
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

  it('permite PATCH al Ingeniero 2 y bloquea al rol Orbinodo', async () => {
    const engineer2: AuthUser = {
      username: 'Ingeniero 2', displayName: 'Ingeniero 2', role: 'engineer2',
    };
    const accepted = vi.fn<CameraService['updateOperations']>(async () => ({
      camera: { ...camera, ...operations }, changedFields: ['status'],
    }));
    const acceptedResponse = await buildApp(engineer2, service({ updateOperations: accepted })).inject({
      method: 'PATCH', url: '/api/cameras/camera-01/operations', headers: cookie, payload: operations,
    });
    expect(acceptedResponse.statusCode).toBe(200);
    expect(accepted).toHaveBeenCalledWith('camera-01', engineer2, operations);

    const denied = vi.fn<CameraService['updateOperations']>();
    const deniedResponse = await buildApp({
      username: 'Orbinodo', displayName: 'Orbinodo', role: 'programmer',
    }, service({ updateOperations: denied })).inject({
      method: 'PATCH', url: '/api/cameras/camera-01/operations', headers: cookie, payload: operations,
    });
    expect(deniedResponse.statusCode).toBe(403);
    expect(denied).not.toHaveBeenCalled();
  });

  it('version conflict returns 409', async () => {
    const update = vi.fn<CameraService['updateOperations']>(async () => {
      throw new CameraVersionConflictError();
    });
    const app = buildApp(engineer, service({ updateOperations: update }));
    const response = await app.inject({
      method: 'PATCH', url: '/api/cameras/camera-01/operations', headers: cookie, payload: operations,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('RESOURCE_CONFLICT');
  });
  it('rechaza payload manipulado y no alcanza PostgreSQL', async () => {
    const update = vi.fn<CameraService['updateOperations']>();
    const response = await buildApp(engineer, service({ updateOperations: update })).inject({
      method: 'PATCH', url: '/api/cameras/camera-01/operations', headers: cookie,
      payload: {
        ...operations,
        assetCode: 'CCTV-ALTERADO', location: 'Ubicación alterada',
        yaw: 180, role: 'manager', username: 'Jefe', userId: 'otro-usuario',
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('VALIDATION_ERROR');
    expect(update).not.toHaveBeenCalled();
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

  it('rejects invalid camera IDs before the service', async () => {
    const getCamera = vi.fn<CameraService['getCamera']>();
    const app = buildApp(engineer, service({ getCamera }));
    for (const id of ['camera-1', 'camera-001', 'camera-ab', 'camera-01%27%20OR%201%3D1--']) {
      const response = await app.inject({ method: 'GET', url: '/api/cameras/' + id, headers: cookie });
      expect(response.statusCode, id).toBe(400);
      expect(response.json().error).toBe('VALIDATION_ERROR');
    }
    expect(getCamera).not.toHaveBeenCalled();
  });

  it('rejects required fields, empty values, enums and bounds before the service', async () => {
    const update = vi.fn<CameraService['updateOperations']>();
    const app = buildApp(engineer, service({ updateOperations: update }));
    const cases = [
      { ...operations, notes: undefined },
      { ...operations, notes: '   ' },
      { ...operations, status: 'Desconocido' },
      { ...operations, responsibleArea: 'a'.repeat(101) },
      { ...operations, notes: 'a'.repeat(501) },
      { ...operations, lastMaintenanceOn: '2026-07-01', nextMaintenanceOn: '2026-02-01' },
    ];
    for (const payload of cases) {
      const response = await app.inject({
        method: 'PATCH', url: '/api/cameras/camera-01/operations', headers: cookie, payload,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('VALIDATION_ERROR');
    }
    expect(update).not.toHaveBeenCalled();
  });
});
