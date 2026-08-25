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
  logger?: boolean;
}

export function createApiApp(options: ApiAppOptions) {
  const app = Fastify({
    trustProxy: options.trustedProxyHops || false,
    logger: options.logger
      ? {
          level: 'info',
          redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'],
        }
      : false,
  });

  // Las sesiones futuras usarán cookies HttpOnly; ninguna ruta debe analizarlas a mano.
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

  app.get('/api/health', async (_request, reply) => {
    try {
      const serverTime = await options.healthProbe.readServerTime();
      return {
        status: 'ok',
        database: 'available',
        serverTime: serverTime.toISOString(),
      };
    } catch {
      return reply.code(503).send(apiError(
        'DATABASE_UNAVAILABLE', 'La base de datos no está disponible.',
      ));
    }
  });

  app.setNotFoundHandler((_request, reply) => reply.code(404).send(
    apiError('ROUTE_NOT_FOUND', 'La ruta solicitada no existe.'),
  ));

  // Los errores inesperados no revelan rutas, consultas ni trazas internas.
  app.setErrorHandler((error, _request, reply) => {
    const errorCode = error && typeof error === 'object' && 'code' in error
      ? error.code : undefined;
    if (errorCode === 'FST_ERR_CTP_INVALID_JSON_BODY') {
      return reply.code(400).send(apiError('INVALID_JSON', 'El cuerpo JSON no es válido.'));
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
    return reply.code(500).send(apiError('INTERNAL_ERROR', 'No fue posible procesar la solicitud.'));
  });

  return app;
}
