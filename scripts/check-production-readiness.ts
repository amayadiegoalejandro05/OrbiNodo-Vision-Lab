import { loadBackendEnvironment } from '../backend/config/environment.js';
import { loadMigrationFiles } from '../backend/database/migration-files.js';
import { createPostgresPool } from '../backend/database/postgres-options.js';

type AppliedMigration = { version: string; checksum: string };

function fail(message: string): never {
  throw new Error(message);
}

async function verifyProductionReadiness(): Promise<void> {
  const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!connectionString?.match(/^postgres(?:ql)?:\/\//)) {
    fail('db:preflight requiere una DATABASE_URL o POSTGRES_URL PostgreSQL real.');
  }
  const environment = loadBackendEnvironment();
  const pool = createPostgresPool(environment);
  try {
    const migrationTable = await pool.query<{ exists: boolean }>(
      "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists",
    );
    if (!migrationTable.rows[0]?.exists) {
      fail('La base no tiene schema_migrations. Ejecuta db:migrate antes de desplegar.');
    }

    const expected = await loadMigrationFiles();
    const appliedResult = await pool.query<AppliedMigration>(
      'SELECT version, checksum FROM schema_migrations ORDER BY version',
    );
    const applied = new Map(appliedResult.rows.map((migration) => [
      migration.version, migration.checksum,
    ]));
    const missing = expected
      .filter((migration) => !applied.has(migration.version))
      .map((migration) => migration.version);
    if (missing.length > 0) {
      fail('Faltan migraciones: ' + missing.join(', ') + '. Ejecuta db:migrate antes de desplegar.');
    }
    const altered = expected.find((migration) => applied.get(migration.version) !== migration.checksum);
    if (altered) {
      fail('El checksum de la migracion no coincide: ' + altered.version + '. No despliegues.');
    }

    const endedAt = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'access_sessions'
          AND column_name = 'ended_at'
      ) AS exists`,
    );
    if (!endedAt.rows[0]?.exists) {
      fail('Falta access_sessions.ended_at. No despliegues hasta aplicar las migraciones.');
    }

    await pool.query('SELECT CURRENT_TIMESTAMP');
    console.log('Preflight correcto: Neon esta disponible y el esquema coincide con el backend.');
  } finally {
    await pool.end();
  }
}

verifyProductionReadiness().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Error desconocido.';
  console.error('Preflight no superado: ' + message);
  process.exitCode = 1;
});
