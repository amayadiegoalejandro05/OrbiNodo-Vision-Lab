import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApiApp } from '../backend/app.js';
import { loadBackendEnvironment } from '../backend/config/environment.js';
import { createPostgresAuditService } from '../backend/database/postgres-audit-service.js';
import { createPostgresAuthService } from '../backend/database/postgres-auth-service.js';
import { createPostgresCameraService } from '../backend/database/postgres-camera-service.js';
import { createPostgresHealthProbe } from '../backend/database/postgres-health-probe.js';
import { createPostgresPool } from '../backend/database/postgres-options.js';

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
