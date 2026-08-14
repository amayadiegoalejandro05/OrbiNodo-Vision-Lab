import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiApp } from '../app';
import type { AuthService } from '../domain/auth-service';

const apps: Array<ReturnType<typeof createApiApp>> = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

function buildApp(authService: AuthService, cookieSecure = false) {
  const app = createApiApp({
    authService, cookieSecure, cookieName: 'orbinodo_session', sessionHours: 8,
    healthProbe: { readServerTime: async () => new Date() },
  });

  apps.push(app);
  return app;
}

const user = { username: 'Ingeniero 1', displayName: 'Ingeniero 1', role: 'engineer1' as const };

function fakeService(overrides: Partial<AuthService> = {}): AuthService {
  return {
    login: async () => null,
    getSession: async () => null,
    logout: async () => undefined,
    ...overrides,
  };
}

describe('autenticación HTTP', () => {
  it('crea una cookie HttpOnly sin exponer el token en el cuerpo', async () => {
    const app = buildApp(fakeService({ login: async () => ({
      token: 'a'.repeat(43), user, expiresAt: new Date('2026-08-14T04:00:00Z'),
    }) }));
    const response = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { username: user.username, password: '1234567890' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('a'.repeat(43));
    const cookie = response.headers['set-cookie'];
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).not.toContain('Secure');
  });

  it('usa un error genérico para credenciales inválidas', async () => {
    const app = buildApp(fakeService());
    const response = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { username: 'nadie', password: 'incorrecta0' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      message: 'Usuario o contraseña incorrectos.',
    });
  });
  it('consulta y cierra una sesión usando la cookie', async () => {
    const logout = vi.fn(async () => undefined);
    const service = fakeService({ getSession: async () => user, logout });
    const app = buildApp(service);
    const headers = { cookie: `orbinodo_session=${'b'.repeat(43)}` };
    const me = await app.inject({
      method: 'GET', url: '/api/auth/me', headers,
    });
    expect(me.json()).toEqual({ user });
    const closed = await app.inject({
      method: 'POST', url: '/api/auth/logout', headers,
    });
    expect(closed.statusCode).toBe(204);
    expect(logout).toHaveBeenCalledOnce();
    expect(closed.headers['set-cookie']).toContain('Max-Age=0');
  });
});
