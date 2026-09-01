import { createApiApp } from './app';
import { isProductionDeployment, loadBackendEnvironment } from './config/environment';
import { createPostgresAuthService } from './database/postgres-auth-service';
import { createPostgresAuditService } from './database/postgres-audit-service';
import { createPostgresCameraService } from './database/postgres-camera-service';
import { createPostgresHealthProbe } from './database/postgres-health-probe';
import { createPostgresPool } from './database/postgres-options';

async function startServer(): Promise<void> {
  const environment = loadBackendEnvironment();
  const pool = createPostgresPool(environment);
  const healthProbe = createPostgresHealthProbe(pool);
  const authService = createPostgresAuthService(
    pool, {
      sessionHours: environment.ORBINODO_SESSION_HOURS,
      idleMinutes: environment.ORBINODO_SESSION_IDLE_MINUTES,
      loginMaxAttempts: environment.ORBINODO_LOGIN_MAX_ATTEMPTS,
      loginWindowMinutes: environment.ORBINODO_LOGIN_WINDOW_MINUTES,
      loginBlockMinutes: environment.ORBINODO_LOGIN_BLOCK_MINUTES,
    },
  );
  const cameraService = createPostgresCameraService(pool);
  const auditService = createPostgresAuditService(pool);
  const app = createApiApp({
    healthProbe, authService, cameraService, auditService, logger: true,
    cookieName: environment.ORBINODO_COOKIE_NAME,
    cookieSecure: environment.ORBINODO_COOKIE_SECURE === 'true',
    sessionHours: environment.ORBINODO_SESSION_HOURS,
    trustedProxyHops: environment.ORBINODO_TRUSTED_PROXY_HOPS,
    requireHttps: isProductionDeployment(environment),
    connectionTimeoutMs: environment.ORBINODO_API_CONNECTION_TIMEOUT_MS,
    keepAliveTimeoutMs: environment.ORBINODO_API_KEEP_ALIVE_TIMEOUT_MS,
    requestTimeoutMs: environment.ORBINODO_API_REQUEST_TIMEOUT_MS,
    apiRateLimitMaxRequests: environment.ORBINODO_API_RATE_LIMIT_MAX_REQUESTS,
    apiRateLimitWindowMs: environment.ORBINODO_API_RATE_LIMIT_WINDOW_SECONDS * 1_000,
    logLevel: environment.ORBINODO_LOG_LEVEL,
  });

  const closeGracefully = async () => {
    await app.close();
    await pool.end();
  };
  process.once('SIGINT', () => void closeGracefully());
  process.once('SIGTERM', () => void closeGracefully());

  await app.listen({
    host: environment.ORBINODO_API_HOST,
    port: environment.ORBINODO_API_PORT,
  });
}

startServer().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Error desconocido.';
  console.error('No fue posible iniciar la API de Orbinodo: ' + message);
  process.exitCode = 1;
});
