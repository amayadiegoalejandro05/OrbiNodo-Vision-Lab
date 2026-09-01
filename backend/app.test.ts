import { afterEach, describe, expect, it } from 'vitest';
import {
  API_BODY_LIMIT_BYTES,
  API_CONNECTION_TIMEOUT_MS,
  API_KEEP_ALIVE_TIMEOUT_MS,
  API_REQUEST_TIMEOUT_MS,
  createApiApp,
} from './app';
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

  it('confirma liveness aunque PostgreSQL no este disponible', async () => {
    const app = createApiApp({
      ...authOptions,
      healthProbe: { readServerTime: async () => { throw new Error('database unavailable'); } },
    });
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/api/live' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', service: 'api' });
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(503);
  });

  it('rejects HTTP when production HTTPS is required', async () => {
    const app = createApiApp({
      ...authOptions, cookieSecure: true, requireHttps: true, trustedProxyHops: 1,
      healthProbe: { readServerTime: async () => new Date() },
    });
    apps.push(app);
    const http = await app.inject({ method: 'GET', url: '/api/health',
      headers: { 'x-forwarded-proto': 'http' } });
    expect(http.statusCode).toBe(426);
    expect(http.json().error).toBe('HTTPS_REQUIRED');
    const https = await app.inject({ method: 'GET', url: '/api/health',
      headers: { 'x-forwarded-proto': 'https' } });
    expect(https.statusCode).toBe(200);
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

  it('conserva errores 413 y 415 como errores de cliente sanitizados', async () => {
    const app = createApiApp({
      ...authOptions, healthProbe: { readServerTime: async () => new Date() },
    });
    apps.push(app);
    const large = await app.inject({ method: 'POST', url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ username: 'x', password: 'a'.repeat(API_BODY_LIMIT_BYTES) }) });
    expect(large.statusCode).toBe(413);
    expect(large.json().error).toBe('PAYLOAD_TOO_LARGE');
    const media = await app.inject({ method: 'POST', url: '/api/auth/login',
      headers: { 'content-type': 'application/xml' }, payload: '<login />' });
    expect(media.statusCode).toBe(415);
    expect(media.json().error).toBe('UNSUPPORTED_MEDIA_TYPE');
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

  it('normalizes native Fastify validation as a sanitized 400', async () => {
    const validation = Object.assign(new Error('forbidden internal field'), {
      code: 'FST_ERR_VALIDATION',
    });
    const app = createApiApp({ ...authOptions, authService: managerAuth,
      cameraService: failingCameras(validation), healthProbe: { readServerTime: async () => new Date() } });
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/api/cameras',
      headers: { cookie: 'orbinodo_session=x' } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'VALIDATION_ERROR', message: 'Los datos de la solicitud no son validos.',
    });
    expect(response.body).not.toContain('forbidden internal field');
  });

  it('sanitizes SQL, paths and secrets from unexpected 500 responses', async () => {
    const internalDetail = 'SELECT password_hash FROM users; C:\\backend\\app.ts; '
      + 'postgresql://usuario:secreto@db.interna/orbinodo; token=secreto';
    const app = createApiApp({ ...authOptions, authService: managerAuth,
      cameraService: failingCameras(new Error(internalDetail)),
      healthProbe: { readServerTime: async () => new Date() } });
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/api/cameras',
      headers: { cookie: 'orbinodo_session=x' } });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: 'INTERNAL_ERROR', message: 'No fue posible procesar la solicitud.',
    });
    for (const forbidden of ['SELECT', 'password_hash', 'C:\\backend', 'postgresql://', 'secreto']) {
      expect(response.body).not.toContain(forbidden);
    }
  });
  it('aplica cabeceras seguras y no expone powered-by', async () => {
    const app = createApiApp({
      ...authOptions, healthProbe: { readServerTime: async () => new Date() },
    });
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['cross-origin-resource-policy']).toBe('same-origin');
    expect(response.headers['permissions-policy']).toContain('camera=()');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('acepta mismo origen y bloquea origen externo', async () => {
    const app = createApiApp({
      ...authOptions, healthProbe: { readServerTime: async () => new Date() },
    });
    apps.push(app);
    const sameOrigin = await app.inject({
      method: 'GET', url: '/api/health',
      headers: { host: 'api.orbinodo.test', origin: 'https://api.orbinodo.test' },
    });
    expect(sameOrigin.statusCode).toBe(200);

    const external = await app.inject({
      method: 'GET', url: '/api/health',
      headers: { host: 'api.orbinodo.test', origin: 'https://externo.example' },
    });
    expect(external.statusCode).toBe(403);
    expect(external.json().error).toBe('CORS_ORIGIN_FORBIDDEN');
  });

  it('rechaza metodos no permitidos con 405 y Allow', async () => {
    const app = createApiApp({
      ...authOptions, healthProbe: { readServerTime: async () => new Date() },
    });
    apps.push(app);
    const response = await app.inject({ method: 'DELETE', url: '/api/auth/login' });

    expect(response.statusCode).toBe(405);
    expect(response.headers.allow).toBe('POST');
    expect(response.json().error).toBe('METHOD_NOT_ALLOWED');
  });

  it('limita solicitudes repetidas por instancia sin afectar salud', async () => {
    const app = createApiApp({
      ...authOptions,
      apiRateLimitMaxRequests: 1,
      apiRateLimitWindowMs: 60_000,
      healthProbe: { readServerTime: async () => new Date() },
    });
    apps.push(app);
    const first = await app.inject({
      method: 'POST', url: '/api/auth/login', payload: { username: 'Jefe', password: '1234567890' },
    });
    expect(first.statusCode).toBe(401);
    const limited = await app.inject({
      method: 'POST', url: '/api/auth/login', payload: { username: 'Jefe', password: '1234567890' },
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error).toBe('API_RATE_LIMITED');
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
  });

  it('configura timeouts HTTP seguros por defecto', async () => {
    const app = createApiApp({
      ...authOptions, healthProbe: { readServerTime: async () => new Date() },
    });
    apps.push(app);

    expect(app.server.timeout).toBe(API_CONNECTION_TIMEOUT_MS);
    expect(app.server.keepAliveTimeout).toBe(API_KEEP_ALIVE_TIMEOUT_MS);
    expect(app.server.requestTimeout).toBe(API_REQUEST_TIMEOUT_MS);
  });

});
