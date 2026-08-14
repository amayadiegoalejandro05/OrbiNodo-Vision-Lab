import { createApiApp } from './app';
import { loadBackendEnvironment } from './config/environment';
import { createPostgresAuthService } from './database/postgres-auth-service';
import { createPostgresHealthProbe } from './database/postgres-health-probe';
import { createPostgresPool } from './database/postgres-options';

async function startServer(): Promise<void> {
  const environment = loadBackendEnvironment();
  const pool = createPostgresPool(environment);
  const healthProbe = createPostgresHealthProbe(pool);
  const authService = createPostgresAuthService(
    pool, environment.ORBINODO_SESSION_HOURS,
  );
  const app = createApiApp({
    healthProbe, authService, logger: true,
    cookieName: environment.ORBINODO_COOKIE_NAME,
    cookieSecure: environment.ORBINODO_COOKIE_SECURE === 'true',
    sessionHours: environment.ORBINODO_SESSION_HOURS,
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
