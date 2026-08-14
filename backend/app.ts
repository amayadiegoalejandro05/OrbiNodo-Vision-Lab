import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import type { HealthProbe } from './domain/health-probe';

export interface ApiAppOptions {
  healthProbe: HealthProbe;
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
