import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AuthService } from '../domain/auth-service';
import type { CameraService } from '../domain/camera-service';
import { CameraActorNotAllowedError } from '../domain/camera-service.js';

export interface CameraRouteOptions {
  authService: AuthService;
  cameraService: CameraService;
  cookieName: string;
}

const routeParams = z.object({ id: z.string().trim().min(1).max(80) }).strict();
function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month! - 1
    && date.getUTCDate() === day;
}
const isoDate = z.string().refine(isIsoDate);
const operationsBody = z.object({
  status: z.enum(['Operativa', 'En mantenimiento', 'Fuera de servicio']),
  lastMaintenanceOn: isoDate,
  nextMaintenanceOn: isoDate,
  responsibleArea: z.string().trim().min(1).max(100),
  notes: z.string().trim().min(1).max(500),
}).strict().refine(
  (value) => value.nextMaintenanceOn >= value.lastMaintenanceOn,
  { message: 'La próxima fecha no puede ser anterior.' },
);

export const cameraRoutes: FastifyPluginAsync<CameraRouteOptions> = async (app, options) => {
  async function currentUser(request: FastifyRequest) {
    const token = request.cookies[options.cookieName];
    return token ? options.authService.getSession(token) : null;
  }

  app.get('/', async (request, reply) => {
    const user = await currentUser(request);
    if (!user) return reply.code(401).send({ message: 'Sesión no válida.' });
    return { cameras: await options.cameraService.listCameras() };
  });

  app.patch('/:id/operations', async (request, reply) => {
    const user = await currentUser(request);
    if (!user) return reply.code(401).send({ message: 'Sesión no válida.' });
    if (user.role !== 'engineer1' && user.role !== 'engineer2') {
      return reply.code(403).send({ message: 'Este perfil no puede editar cámaras.' });
    }
    const params = routeParams.safeParse(request.params);
    const body = operationsBody.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({ message: 'Los datos operativos no son válidos.' });
    }
    try {
      const result = await options.cameraService.updateOperations(
        params.data.id, user, body.data,
      );
      if (!result) {
        return reply.code(404).send({ message: 'La cámara no existe.' });
      }
      return result;
    } catch (error) {
      if (error instanceof CameraActorNotAllowedError) {
        return reply.code(403).send({ message: 'Este perfil no puede editar cámaras.' });
      }
      throw error;
    }
  });
};
