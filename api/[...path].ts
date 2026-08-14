import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApiApp } from '../backend/app';
import { loadBackendEnvironment } from '../backend/config/environment';
import { createPostgresAuditService } from '../backend/database/postgres-audit-service';
import { createPostgresAuthService } from '../backend/database/postgres-auth-service';
import { createPostgresCameraService } from '../backend/database/postgres-camera-service';
import { createPostgresHealthProbe } from '../backend/database/postgres-health-probe';
import { createPostgresPool } from '../backend/database/postgres-options';

const environment = loadBackendEnvironment();
const pool = createPostgresPool(environment);
const authService = createPostgresAuthService(pool, environment.ORBINODO_SESSION_HOURS);
const app = createApiApp({
  healthProbe: createPostgresHealthProbe(pool),
  authService,
  auditService: createPostgresAuditService(pool),
  cameraService: createPostgresCameraService(pool),
  cookieName: environment.ORBINODO_COOKIE_NAME,
  cookieSecure: environment.ORBINODO_COOKIE_SECURE === 'true',
  sessionHours: environment.ORBINODO_SESSION_HOURS,
  logger: true,
});
const ready = app.ready();

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  await ready;
  app.server.emit('request', request, response);
}
