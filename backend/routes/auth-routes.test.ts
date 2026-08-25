import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiApp } from '../app';
import type { AuthService, LoginContext } from '../domain/auth-service';
import { LoginRateLimitedError } from '../domain/auth-service.js';
import type { CameraService } from '../domain/camera-service';

const apps: Array<ReturnType<typeof createApiApp>> = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));
const unusedCameras: CameraService = {
  listCameras: async () => [],
  getCamera: async () => null,
  updateOperations: async () => null,
};

function buildApp(authService: AuthService, cookieSecure = false, trustedProxyHops = 0) {
  const app = createApiApp({
    authService, cookieSecure, cookieName: 'orbinodo_session', sessionHours: 8,
    auditService: { listAccessSessions: async () => [], listCameraChanges: async () => [] },
    cameraService: unusedCameras,
    healthProbe: { readServerTime: async () => new Date() },
    trustedProxyHops,
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
      error: 'INVALID_CREDENTIALS',
      message: 'Usuario o contraseña incorrectos.',
    });
  });

  it('distingue un cuerpo inválido de credenciales incorrectas', async () => {
    const response = await buildApp(fakeService()).inject({
      method: 'POST', url: '/api/auth/login', payload: { username: '' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('VALIDATION_ERROR');
  });

  it('responde 429 cuando PostgreSQL bloquea los intentos de login', async () => {
    const app = buildApp(fakeService({
      login: async () => { throw new LoginRateLimitedError(); },
    }));
    const response = await app.inject({ method: 'POST', url: '/api/auth/login',
      payload: { username: 'Jefe', password: '1234567890' } });
    expect(response.statusCode).toBe(429);
    expect(response.json().error).toBe('LOGIN_RATE_LIMITED');
  });

  it('responde 401 cuando la sesión ya expiró', async () => {
    const app = buildApp(fakeService({ getSession: async () => null }));
    const response = await app.inject({ method: 'GET', url: '/api/auth/me',
      headers: { cookie: `orbinodo_session=${'x'.repeat(43)}` } });
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe('SESSION_REQUIRED');
  });

  it('usa la IP reenviada solo con un proxy configurado', async () => {
    const login = vi.fn(async (
      _username: string, _password: string, _context: LoginContext,
    ) => null);
    const app = buildApp(fakeService({ login }), false, 1);
    await app.inject({ method: 'POST', url: '/api/auth/login',
      headers: { 'x-forwarded-for': '198.51.100.8' },
      payload: { username: 'Jefe', password: '1234567890' } });
    expect(login.mock.calls[0]?.[2]).toEqual({ sourceIp: '198.51.100.8' });
    const directLogin = vi.fn(async (
      _username: string, _password: string, _context: LoginContext,
    ) => null);
    await buildApp(fakeService({ login: directLogin })).inject({
      method: 'POST', url: '/api/auth/login',
      headers: { 'x-forwarded-for': '198.51.100.9' },
      payload: { username: 'Jefe', password: '1234567890' },
    });
    expect(directLogin.mock.calls[0]?.[2]?.sourceIp).not.toBe('198.51.100.9');
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
