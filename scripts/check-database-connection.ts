import { loadBackendEnvironment } from '../backend/config/environment';
import { createPostgresPool } from '../backend/database/postgres-options';

const pool = createPostgresPool(loadBackendEnvironment());
try {
  const result = await pool.query<{ server_version: string }>(
    'SELECT current_setting(\'server_version_num\') AS server_version',
  );
  console.log(
    'Conexión PostgreSQL verificada. Versión numérica: '
    + (result.rows[0]?.server_version ?? 'desconocida') + '.',
  );
} catch (error) {
  const errors = error instanceof AggregateError ? error.errors : [error];
  const codes = errors.map((item: unknown) => (
    typeof item === 'object' && item !== null && 'code' in item
      && typeof item.code === 'string' ? item.code : 'SIN_CODIGO'
  ));
  console.error('Conexión PostgreSQL fallida. Códigos seguros: ' + codes.join(', ') + '.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
