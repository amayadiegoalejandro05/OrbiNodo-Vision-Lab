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

migrate().catch(() => {
  // El comando no imprime trazas, consultas ni detalles que puedan incluir secretos.
  console.error('No fue posible aplicar las migraciones. Revisa PostgreSQL y el entorno local.');
  process.exitCode = 1;
});
