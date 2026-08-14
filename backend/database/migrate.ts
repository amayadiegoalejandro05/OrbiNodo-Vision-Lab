import { loadBackendEnvironment } from '../config/environment';
import { runMigrations } from './migration-runner';

async function migrate(): Promise<void> {
  const completed = await runMigrations(loadBackendEnvironment());
  if (completed.length === 0) {
    console.log('La base de datos ya tiene todas las migraciones aplicadas.');
    return;
  }
  for (const version of completed) console.log('Migración aplicada: ' + version);
}

migrate().catch((error: unknown) => {
  // El comando no imprime trazas, consultas ni detalles que puedan incluir secretos.
  const code = typeof error === 'object' && error !== null && 'code' in error
    && typeof error.code === 'string' && /^[A-Z0-9_]{2,40}$/.test(error.code)
    ? error.code : 'MIGRATION_FAILED';
  const detail = error instanceof Error
    ? error.message
      .replace(/postgres(?:ql)?:\/\/\S+/gi, '[DATABASE_URL_OCULTA]')
      .replace(/password\s*[=:]\s*\S+/gi, 'password=[OCULTA]')
    : 'Error desconocido';
  console.error(
    'No fue posible aplicar las migraciones. Código seguro: ' + code
    + '. Detalle seguro: ' + detail,
  );
  process.exitCode = 1;
});
