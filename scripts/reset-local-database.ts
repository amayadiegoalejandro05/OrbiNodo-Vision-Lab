import { loadBackendEnvironment } from '../backend/config/environment';
import { createPostgresPool } from '../backend/database/postgres-options';
import { readDatabaseState, resetDemoData } from '../backend/database/reset-demo';

if (!process.argv.includes('--confirm-clean-baseline')) {
  throw new Error(
    'Reinicio cancelado. Usa --confirm-clean-baseline para confirmar el borrado del historial.',
  );
}

const pool = createPostgresPool(loadBackendEnvironment());
try {
  const client = await pool.connect();
  try {
    const before = await readDatabaseState(client);
    console.log(
      'Objetivos verificados: se limpiarán ' + before.accessSessions
      + ' sesiones y ' + before.cameraChanges
      + ' cambios; se restaurarán ' + before.operationalStates + ' estados.',
    );
    const result = await resetDemoData(client);
    console.log(
      'Base reiniciada: ' + result.users + ' usuarios, '
      + result.cameras + ' cámaras, ' + result.operationalStates
      + ' estados, 0 sesiones y ' + result.cameraChanges
      + ' cambios históricos conservados.',
    );
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
