import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import type { BackendEnvironment } from '../config/environment';
import { loadMigrationFiles } from './migration-files';
import { createPostgresOptions } from './postgres-options';

const HISTORY_ROLE_BACKFILL_MIGRATION = '0005_harden_camera_change_history.sql';

// La transacción evita esquemas parciales y el bloqueo impide ejecuciones paralelas.
export async function runMigrations(env: BackendEnvironment): Promise<string[]> {
  const pool = new Pool(createPostgresOptions(env));
  try {
    const client = await pool.connect();
    return await executeTransaction(client);
  } finally {
    await pool.end();
  }
}

async function executeTransaction(client: PoolClient): Promise<string[]> {
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [1_849_042_026]);
    const completed = await applyPending(client);
    await client.query('COMMIT');
    return completed;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function applyPending(client: PoolClient): Promise<string[]> {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY,
    checksum text NOT NULL CHECK (char_length(checksum) = 64),
    applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  const result = await client.query<{ version: string; checksum: string }>(
    'SELECT version, checksum FROM schema_migrations ORDER BY version',
  );
  const applied = new Map(result.rows.map((item) => [item.version, item.checksum]));
  return applyFiles(client, applied);
}


async function applyFiles(client: PoolClient, applied: Map<string, string>): Promise<string[]> {
  const completed: string[] = [];
  for (const migration of await loadMigrationFiles()) {
    const previousChecksum = applied.get(migration.version);
    if (previousChecksum && previousChecksum !== migration.checksum) {
      throw new Error('Una migración aplicada fue modificada: ' + migration.version);
    }
    if (previousChecksum) continue;
    if (migration.version === HISTORY_ROLE_BACKFILL_MIGRATION) {
      await client.query('ALTER TABLE camera_change_history DISABLE TRIGGER camera_change_history_append_only');
      try {
        await client.query(migration.sql);
      } finally {
        await client.query('ALTER TABLE camera_change_history ENABLE TRIGGER camera_change_history_append_only');
      }
    } else {
      await client.query(migration.sql);
    }
    await client.query(
      'INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)',
      [migration.version, migration.checksum],
    );
    completed.push(migration.version);
  }
  return completed;
}
