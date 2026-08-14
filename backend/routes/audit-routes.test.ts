import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiApp } from '../app';
import type { AuthUser } from '../domain/auth-service';

const apps: Array<ReturnType<typeof createApiApp>> = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

function buildApp(user: AuthUser | null) {
  const listAccessSessions = vi.fn(async () => [{
    id: 'session-1', timestamp: '2026-08-14T04:00:00.000Z',
    role: 'engineer1' as const, displayName: 'Ingeniero 1', username: 'Ingeniero 1',
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
});
