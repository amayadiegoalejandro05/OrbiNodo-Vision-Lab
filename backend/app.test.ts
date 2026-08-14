import { afterEach, describe, expect, it } from 'vitest';
import { createApiApp } from './app';
import type { AuthService } from './domain/auth-service';

const apps: Array<ReturnType<typeof createApiApp>> = [];
const unusedAuth: AuthService = {
  login: async () => null,
  getSession: async () => null,
  logout: async () => undefined,
};
const authOptions = {
  authService: unusedAuth,
  cookieName: 'orbinodo_session',
  cookieSecure: false,
  sessionHours: 8,
};

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
      status: 'error',
      database: 'unavailable',
      message: 'La base de datos no está disponible.',
    });
    expect(response.body).not.toContain('detalle interno');
  });
});
