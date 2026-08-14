import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import type { AuthService } from './domain/auth-service';
import type { CameraService } from './domain/camera-service';
import type { HealthProbe } from './domain/health-probe';
import { authRoutes } from './routes/auth-routes';
import { cameraRoutes } from './routes/camera-routes';

export interface ApiAppOptions {
  healthProbe: HealthProbe;
  authService: AuthService;
  cameraService: CameraService;
  cookieName: string;
  cookieSecure: boolean;
  sessionHours: number;
  logger?: boolean;
}

export function createApiApp(options: ApiAppOptions) {
  const app = Fastify({
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

  app.get('/api/health', async (_request, reply) => {
    try {
      const serverTime = await options.healthProbe.readServerTime();
      return {
        status: 'ok',
        database: 'available',
        serverTime: serverTime.toISOString(),
      };
    } catch {
      return reply.code(503).send({
        status: 'error',
        database: 'unavailable',
        message: 'La base de datos no está disponible.',
      });
    }
  });

  // Los errores inesperados no revelan rutas, consultas ni trazas internas.
  app.setErrorHandler((_error, _request, reply) => reply.code(500).send({
    status: 'error',
    message: 'No fue posible procesar la solicitud.',
  }));

  return app;
}
