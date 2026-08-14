import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATION_NAME = /^\d{4}_[a-z0-9_]+\.sql$/;
const migrationsDirectory = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

export interface MigrationFile {
  version: string;
  checksum: string;
  sql: string;
}

// Los nombres ordenables hacen que todos los equipos apliquen el mismo historial.
export async function loadMigrationFiles(): Promise<MigrationFile[]> {
  const names = (await readdir(migrationsDirectory))
    .filter((name) => MIGRATION_NAME.test(name))
    .sort((left, right) => left.localeCompare(right));
  if (names.length === 0) throw new Error('No existen migraciones SQL versionadas.');

  return Promise.all(names.map(async (version) => {
    const sql = await readFile(join(migrationsDirectory, version), 'utf8');
    return {
      version,
      checksum: createHash('sha256').update(sql, 'utf8').digest('hex'),
      sql,
    };
  }));
}
