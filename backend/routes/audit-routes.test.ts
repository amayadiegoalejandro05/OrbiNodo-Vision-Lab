import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiApp } from '../app';
import type { AuthUser } from '../domain/auth-service';

const apps: Array<ReturnType<typeof createApiApp>> = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

function buildApp(user: AuthUser | null) {
  const listAccessSessions = vi.fn(async () => [{
    id: 'session-1', timestamp: '2026-08-14T04:00:00.000Z',
    role: 'engineer1' as const, displayName: 'Ingeniero 1', username: 'Ingeniero 1',
    status: 'active' as const,
  }]);
  const listCameraChanges = vi.fn(async () => []);
  const app = createApiApp({
    authService: {
      login: async () => null, getSession: async () => user, logout: async () => undefined,
    },
    auditService: { listAccessSessions, listCameraChanges },
    cameraService: {
      listCameras: async () => [], getCamera: async () => null,
      updateOperations: async () => null,
    },
    healthProbe: { readServerTime: async () => new Date() },
    cookieName: 'orbinodo_session', cookieSecure: false, sessionHours: 8,
  });
  apps.push(app);
  return { app, listAccessSessions, listCameraChanges };
}

const cookie = { cookie: `orbinodo_session=${'a'.repeat(43)}` };

describe('rutas de auditoría', () => {
  it('exige sesión y rechaza a los Ingenieros', async () => {
    const noSession = await buildApp(null).app.inject({
      method: 'GET', url: '/api/audit/access-sessions', headers: cookie,
    });
    expect(noSession.statusCode).toBe(401);
    const engineer = buildApp({
      username: 'Ingeniero 1', displayName: 'Ingeniero 1', role: 'engineer1',
    });
    const forbidden = await engineer.app.inject({
      method: 'GET', url: '/api/audit/camera-changes', headers: cookie,
    });
    expect(forbidden.statusCode).toBe(403);
    expect(engineer.listCameraChanges).not.toHaveBeenCalled();
  });

  it('entrega accesos y cambios únicamente al Jefe', async () => {
    const manager = buildApp({ username: 'Jefe', displayName: 'Jefe', role: 'manager' });
    const access = await manager.app.inject({
      method: 'GET', url: '/api/audit/access-sessions', headers: cookie,
    });
    const changes = await manager.app.inject({
      method: 'GET', url: '/api/audit/camera-changes', headers: cookie,
    });
    expect(access.statusCode).toBe(200);
    expect(access.json().accessSessions).toHaveLength(1);
    expect(changes.statusCode).toBe(200);
    expect(changes.json()).toEqual({ cameraChanges: [] });
  });

  it('valida y entrega filtros de activo y usuario solo al Jefe', async () => {
    const manager = buildApp({ username: 'Jefe', displayName: 'Jefe', role: 'manager' });
    const response = await manager.app.inject({
      method: 'GET',
      url: '/api/audit/camera-changes?cameraId=camera-03&assetCode=CCTV-003&username=Ingeniero%201',
      headers: cookie,
    });
    expect(response.statusCode).toBe(200);
    expect(manager.listCameraChanges).toHaveBeenCalledWith({
      cameraId: 'camera-03', assetCode: 'CCTV-003', username: 'Ingeniero 1',
    });

    const invalid = buildApp({ username: 'Jefe', displayName: 'Jefe', role: 'manager' });
    const invalidResponse = await invalid.app.inject({
      method: 'GET', url: '/api/audit/camera-changes?unexpected=x', headers: cookie,
    });
    expect(invalidResponse.statusCode).toBe(400);
    expect(invalid.listCameraChanges).not.toHaveBeenCalled();

    for (const query of ['username=%20', `assetCode=${'a'.repeat(81)}`]) {
      const invalidValue = buildApp({ username: 'Jefe', displayName: 'Jefe', role: 'manager' });
      const response = await invalidValue.app.inject({
        method: 'GET', url: '/api/audit/camera-changes?' + query, headers: cookie,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('VALIDATION_ERROR');
      expect(invalidValue.listCameraChanges).not.toHaveBeenCalled();
    }
  });

  it('bloquea auditoría para Orbinodo y ambos Ingenieros antes de consultar datos', async () => {
    const users: AuthUser[] = [
      { username: 'Orbinodo', displayName: 'Orbinodo', role: 'programmer' },
      { username: 'Ingeniero 1', displayName: 'Ingeniero 1', role: 'engineer1' },
      { username: 'Ingeniero 2', displayName: 'Ingeniero 2', role: 'engineer2' },
    ];
    for (const user of users) {
      const instance = buildApp(user);
      for (const url of ['/api/audit/access-sessions', '/api/audit/camera-changes']) {
        const response = await instance.app.inject({ method: 'GET', url, headers: cookie });
        expect(response.statusCode, `${user.role} ${url}`).toBe(403);
      }
      expect(instance.listAccessSessions).not.toHaveBeenCalled();
      expect(instance.listCameraChanges).not.toHaveBeenCalled();
    }
  });
});
