import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { apiError } from '../api-error.js';
import type { AuditService } from '../domain/audit-service';
import type { AuthService } from '../domain/auth-service';

export interface AuditRouteOptions {
  authService: AuthService;
  auditService: AuditService;
  cookieName: string;
}

const sessionRequired = apiError('SESSION_REQUIRED', 'Se requiere una sesión válida.');
const managerRequired = apiError('FORBIDDEN_ROLE', 'Solo el Jefe puede consultar la auditoría.');
const historyQuery = z.object({
  cameraId: z.string().trim().min(1).max(80).optional(),
  assetCode: z.string().trim().min(1).max(80).optional(),
  username: z.string().trim().min(1).max(80).optional(),
}).strict();

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
    if (status === 401) return reply.code(401).send(sessionRequired);
    if (status === 403) {
      return reply.code(403).send(managerRequired);
    }
    return { accessSessions: await options.auditService.listAccessSessions() };
  });

  app.get('/camera-changes', async (request, reply) => {
    const status = await managerSession(request);
    if (status === 401) return reply.code(401).send(sessionRequired);
    if (status === 403) {
      return reply.code(403).send(managerRequired);
    }
    const query = historyQuery.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send(apiError(
        'VALIDATION_ERROR', 'Los filtros de auditoría no son válidos.',
      ));
    }
    return { cameraChanges: await options.auditService.listCameraChanges(query.data) };
  });
};
