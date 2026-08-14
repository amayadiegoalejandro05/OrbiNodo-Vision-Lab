import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { AuditService } from '../domain/audit-service';
import type { AuthService } from '../domain/auth-service';

export interface AuditRouteOptions {
  authService: AuthService;
  auditService: AuditService;
  cookieName: string;
}

export const auditRoutes: FastifyPluginAsync<AuditRouteOptions> = async (app, options) => {
  async function managerSession(request: FastifyRequest) {
    const token = request.cookies[options.cookieName];
    const user = token ? await options.authService.getSession(token) : null;
    if (!user) return 401;
    if (user.role !== 'manager') return 403;
    return 200;
  }

  app.get('/access-sessions', async (request, reply) => {
    const status = await managerSession(request);
    if (status === 401) return reply.code(401).send({ message: 'Sesión no válida.' });
    if (status === 403) {
      return reply.code(403).send({ message: 'Solo el Jefe puede consultar la auditoría.' });
    }
    return { accessSessions: await options.auditService.listAccessSessions() };
  });

  app.get('/camera-changes', async (request, reply) => {
    const status = await managerSession(request);
    if (status === 401) return reply.code(401).send({ message: 'Sesión no válida.' });
    if (status === 403) {
      return reply.code(403).send({ message: 'Solo el Jefe puede consultar la auditoría.' });
    }
    return { cameraChanges: await options.auditService.listCameraChanges() };
  });
};
