import { createApiApp } from './app';
import { loadBackendEnvironment } from './config/environment';
import { createPostgresHealthProbe } from './database/postgres-health-probe';

async function startServer(): Promise<void> {
  const environment = loadBackendEnvironment();
  const healthProbe = createPostgresHealthProbe(environment);
  const app = createApiApp({ healthProbe, logger: true });

  const closeGracefully = async () => {
    await app.close();
    await healthProbe.close();
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
