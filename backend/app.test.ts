import { afterEach, describe, expect, it } from 'vitest';
import { createApiApp } from './app';
import type { AuthService } from './domain/auth-service';
import type { CameraService } from './domain/camera-service';

const apps: Array<ReturnType<typeof createApiApp>> = [];
const unusedAuth: AuthService = {
  login: async () => null,
  getSession: async () => null,
  logout: async () => undefined,
};
const managerAuth: AuthService = {
  ...unusedAuth,
  getSession: async () => ({ username: 'Jefe', displayName: 'Jefe', role: 'manager' }),
};
const unusedCameras: CameraService = {
  listCameras: async () => [],
  getCamera: async () => null,
  updateOperations: async () => null,
};
const authOptions = {
  authService: unusedAuth,
  auditService: { listAccessSessions: async () => [], listCameraChanges: async () => [] },
  cameraService: unusedCameras,
  cookieName: 'orbinodo_session',
  cookieSecure: false,
  sessionHours: 8,
};
function failingCameras(error: Error): CameraService {
  return { ...unusedCameras, listCameras: async () => { throw error; } };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('estado de la API de Orbinodo', () => {
  it('confirma API, PostgreSQL y hora calculada por el servidor', async () => {
    const app = createApiApp({
      ...authOptions,
      healthProbe: { readServerTime: async () => new Date('2026-08-13T20:00:00.000Z') },
    });
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      database: 'available',
      serverTime: '2026-08-13T20:00:00.000Z',
    });
  });

  it('informa indisponibilidad sin revelar el error interno', async () => {
    const app = createApiApp({
      ...authOptions,
      healthProbe: {
        readServerTime: async () => {
          throw new Error('detalle interno que no debe salir');
        },
      },
    });
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: 'DATABASE_UNAVAILABLE',
      message: 'La base de datos no está disponible.',
    });
    expect(response.body).not.toContain('detalle interno');
  });

  it('normaliza JSON inválido y rutas inexistentes', async () => {
    const app = createApiApp({
      ...authOptions, healthProbe: { readServerTime: async () => new Date() },
    });
    apps.push(app);
    const invalid = await app.inject({
      method: 'POST', url: '/api/auth/login',
      headers: { 'content-type': 'application/json' }, payload: '{',
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error).toBe('INVALID_JSON');
    const missing = await app.inject({ method: 'GET', url: '/api/no-existe' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error).toBe('ROUTE_NOT_FOUND');
  });

  it('normaliza conflictos PostgreSQL como 409', async () => {
    const conflict = Object.assign(new Error('detalle interno'), { code: '23505' });
    const app = createApiApp({ ...authOptions, authService: managerAuth,
      cameraService: failingCameras(conflict), healthProbe: { readServerTime: async () => new Date() } });
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/api/cameras',
      headers: { cookie: 'orbinodo_session=x' } });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('RESOURCE_CONFLICT');
  });

  it('sanitiza errores inesperados como 500', async () => {
    const app = createApiApp({ ...authOptions, authService: managerAuth,
      cameraService: failingCameras(new Error('secreto interno')),
      healthProbe: { readServerTime: async () => new Date() } });
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/api/cameras',
      headers: { cookie: 'orbinodo_session=x' } });
    expect(response.statusCode).toBe(500);
    expect(response.json().error).toBe('INTERNAL_ERROR');
    expect(response.body).not.toContain('secreto interno');
  });
});
