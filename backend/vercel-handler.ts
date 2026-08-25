import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApiApp } from './app.js';
import { loadBackendEnvironment } from './config/environment.js';
import { createPostgresAuditService } from './database/postgres-audit-service.js';
import { createPostgresAuthService } from './database/postgres-auth-service.js';
import { createPostgresCameraService } from './database/postgres-camera-service.js';
import { createPostgresHealthProbe } from './database/postgres-health-probe.js';
import { createPostgresPool } from './database/postgres-options.js';

const environment = loadBackendEnvironment();
const pool = createPostgresPool(environment);
const authService = createPostgresAuthService(pool, {
  sessionHours: environment.ORBINODO_SESSION_HOURS,
  idleMinutes: environment.ORBINODO_SESSION_IDLE_MINUTES,
  loginMaxAttempts: environment.ORBINODO_LOGIN_MAX_ATTEMPTS,
  loginWindowMinutes: environment.ORBINODO_LOGIN_WINDOW_MINUTES,
  loginBlockMinutes: environment.ORBINODO_LOGIN_BLOCK_MINUTES,
});
const app = createApiApp({
  healthProbe: createPostgresHealthProbe(pool),
  authService,
  auditService: createPostgresAuditService(pool),
  cameraService: createPostgresCameraService(pool),
  cookieName: environment.ORBINODO_COOKIE_NAME,
  cookieSecure: environment.ORBINODO_COOKIE_SECURE === 'true',
  sessionHours: environment.ORBINODO_SESSION_HOURS,
  trustedProxyHops: environment.ORBINODO_TRUSTED_PROXY_HOPS,
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
