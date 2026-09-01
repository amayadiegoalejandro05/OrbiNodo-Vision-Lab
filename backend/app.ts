import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { apiError } from './api-error.js';
import type { AuditService } from './domain/audit-service.js';
import type { AuthService } from './domain/auth-service.js';
import type { CameraService } from './domain/camera-service.js';
import type { HealthProbe } from './domain/health-probe.js';
import { authRoutes } from './routes/auth-routes.js';
import { auditRoutes } from './routes/audit-routes.js';
import { cameraRoutes } from './routes/camera-routes.js';

export interface ApiAppOptions {
  healthProbe: HealthProbe;
  authService: AuthService;
  auditService: AuditService;
  cameraService: CameraService;
  cookieName: string;
  cookieSecure: boolean;
  sessionHours: number;
  trustedProxyHops?: number;
  requireHttps?: boolean;
  connectionTimeoutMs?: number;
  keepAliveTimeoutMs?: number;
  requestTimeoutMs?: number;
  apiRateLimitMaxRequests?: number;
  apiRateLimitWindowMs?: number;
  logger?: boolean;
  logLevel?: 'info' | 'warn' | 'error';
}

export const API_BODY_LIMIT_BYTES = 16 * 1024;
export const API_CONNECTION_TIMEOUT_MS = 10_000;
export const API_KEEP_ALIVE_TIMEOUT_MS = 5_000;
export const API_REQUEST_TIMEOUT_MS = 25_000;
export const API_RATE_LIMIT_MAX_REQUESTS = 120;
export const API_RATE_LIMIT_WINDOW_MS = 60_000;

const endpointMethods: Array<{ pattern: RegExp; methods: string[] }> = [
  { pattern: /^\/api\/health$/, methods: ['GET', 'HEAD'] },
  { pattern: /^\/api\/live$/, methods: ['GET', 'HEAD'] },
  { pattern: /^\/api\/auth\/login$/, methods: ['POST'] },
  { pattern: /^\/api\/auth\/logout$/, methods: ['POST'] },
  { pattern: /^\/api\/auth\/me$/, methods: ['GET', 'HEAD'] },
  { pattern: /^\/api\/cameras$/, methods: ['GET', 'HEAD'] },
  { pattern: /^\/api\/cameras\/camera-\d{2}$/, methods: ['GET', 'HEAD'] },
  { pattern: /^\/api\/cameras\/camera-\d{2}\/operations$/, methods: ['PATCH'] },
  { pattern: /^\/api\/audit\/access-sessions$/, methods: ['GET', 'HEAD'] },
  { pattern: /^\/api\/audit\/camera-changes$/, methods: ['GET', 'HEAD'] },
];

function pathname(url: string): string {
  return new URL(url, 'http://orbinodo.internal').pathname;
}

function isSameOrigin(origin: string, host: string | undefined): boolean {
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function createApiApp(options: ApiAppOptions) {
  const rateLimitMaxRequests = options.apiRateLimitMaxRequests ?? API_RATE_LIMIT_MAX_REQUESTS;
  const rateLimitWindowMs = options.apiRateLimitWindowMs ?? API_RATE_LIMIT_WINDOW_MS;
  const requestCounters = new Map<string, { count: number; expiresAt: number }>();
  const app = Fastify({
    bodyLimit: API_BODY_LIMIT_BYTES,
    trustProxy: options.trustedProxyHops || false,
    connectionTimeout: options.connectionTimeoutMs ?? API_CONNECTION_TIMEOUT_MS,
    keepAliveTimeout: options.keepAliveTimeoutMs ?? API_KEEP_ALIVE_TIMEOUT_MS,
    requestTimeout: options.requestTimeoutMs ?? API_REQUEST_TIMEOUT_MS,
    logger: options.logger
      ? {
          level: options.logLevel ?? 'info',
          redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'],
        }
      : false,
  });

  app.addHook('onRequest', async (request, reply) => {
    const path = pathname(request.url);
    const origin = request.headers.origin;
    if (origin && !isSameOrigin(origin, request.headers.host)) {
      return reply.code(403).send(apiError(
        'CORS_ORIGIN_FORBIDDEN', 'El origen de la solicitud no esta autorizado.',
      ));
    }

    const endpoint = endpointMethods.find(({ pattern }) => pattern.test(path));
    if (endpoint && !endpoint.methods.includes(request.method)) {
      reply.header('allow', endpoint.methods.join(', '));
      return reply.code(405).send(apiError(
        'METHOD_NOT_ALLOWED', 'El metodo HTTP no esta permitido para este recurso.',
      ));
    }

    // Login retains its PostgreSQL-backed shared limiter. This bounded per-instance
    // limiter adds inexpensive protection to every other API request.
    if (path === '/api/live') return;
    if (path !== '/api/health') {
      const now = Date.now();
      const current = requestCounters.get(request.ip);
      const counter = !current || current.expiresAt <= now
        ? { count: 0, expiresAt: now + rateLimitWindowMs }
        : current;
      counter.count += 1;
      requestCounters.set(request.ip, counter);
      if (counter.count > rateLimitMaxRequests) {
        return reply.code(429).send(apiError(
          'API_RATE_LIMITED', 'Demasiadas solicitudes. Intenta nuevamente mas tarde.',
        ));
      }
    }
  });

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.removeHeader('x-powered-by');
    reply.header('cache-control', 'no-store');
    reply.header('content-security-policy', "default-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    reply.header('cross-origin-resource-policy', 'same-origin');
    reply.header('permissions-policy', 'camera=(), geolocation=(), microphone=()');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    return payload;
  });

  if (options.requireHttps) {
    app.addHook('onRequest', async (request, reply) => {
      if (request.protocol === 'https') return;
      return reply.code(426).send(apiError(
        'HTTPS_REQUIRED', 'La API solo acepta conexiones HTTPS.',
      ));
    });
  }

  void app.register(cookie);
  void app.register(authRoutes, {
    prefix: '/api/auth',
    authService: options.authService,
    cookieName: options.cookieName,
    cookieSecure: options.cookieSecure,
    sessionHours: options.sessionHours,
  });
  void app.register(cameraRoutes, {
    prefix: '/api/cameras',
    authService: options.authService,
    cameraService: options.cameraService,
    cookieName: options.cookieName,
  });
  void app.register(auditRoutes, {
    prefix: '/api/audit',
    authService: options.authService,
    auditService: options.auditService,
    cookieName: options.cookieName,
  });

  app.get('/api/live', async () => ({
    status: 'ok',
    service: 'api',
  }));

  app.get('/api/health', async (request, reply) => {
    try {
      const serverTime = await options.healthProbe.readServerTime();
      return {
        status: 'ok',
        database: 'available',
        serverTime: serverTime.toISOString(),
      };
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error
        && typeof error.code === 'string' ? error.code : undefined;
      request.log.error({ event: 'database.health', code }, 'PostgreSQL health probe failed');
      return reply.code(503).send(apiError(
        'DATABASE_UNAVAILABLE', 'La base de datos no está disponible.',
      ));
    }
  });

  app.setNotFoundHandler((_request, reply) => reply.code(404).send(
    apiError('ROUTE_NOT_FOUND', 'La ruta solicitada no existe.'),
  ));

  app.setErrorHandler((error, request, reply) => {
    const errorCode = error && typeof error === 'object' && 'code' in error
      ? error.code : undefined;
    if (errorCode === 'FST_ERR_CTP_INVALID_JSON_BODY') {
      return reply.code(400).send(apiError('INVALID_JSON', 'El cuerpo JSON no es valido.'));
    }
    if (errorCode === 'FST_ERR_VALIDATION') {
      return reply.code(400).send(apiError(
        'VALIDATION_ERROR', 'Los datos de la solicitud no son validos.',
      ));
    }
    if (errorCode === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply.code(413).send(apiError(
        'PAYLOAD_TOO_LARGE', 'El cuerpo de la solicitud es demasiado grande.',
      ));
    }
    if (errorCode === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
      return reply.code(415).send(apiError(
        'UNSUPPORTED_MEDIA_TYPE', 'El tipo de contenido no es compatible.',
      ));
    }
    if (errorCode === '23505') {
      return reply.code(409).send(apiError('RESOURCE_CONFLICT', 'El recurso entra en conflicto con datos existentes.'));
    }
    request.log.error({
      error: {
        name: error instanceof Error ? error.name : 'UnknownError',
        code: typeof errorCode === 'string' ? errorCode : undefined,
      },
    }, 'Unexpected API error');
    return reply.code(500).send(apiError('INTERNAL_ERROR', 'No fue posible procesar la solicitud.'));
  });

  return app;
}
