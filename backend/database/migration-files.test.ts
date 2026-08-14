import { describe, expect, it } from 'vitest';
import { loadMigrationFiles } from './migration-files';

describe('migraciones SQL de Orbinodo', () => {
  it('mantiene una versión inicial íntegra y con las entidades obligatorias', async () => {
    const migrations = await loadMigrationFiles();

    expect(migrations.map((item) => item.version)).toEqual(['0001_initial_schema.sql']);
    expect(migrations[0]?.checksum).toMatch(/^[a-f0-9]{64}$/);
    const sql = migrations[0]?.sql ?? '';
    for (const table of [
      'users',
      'cameras',
      'camera_operational_state',
      'camera_change_history',
      'access_sessions',
    ]) {
      expect(sql).toContain('CREATE TABLE ' + table);
    }
  });

  it('protege auditoría, usa hora del servidor y no contiene borrados', async () => {
    const sql = (await loadMigrationFiles())[0]?.sql ?? '';

    expect(sql).toContain('camera_change_history_append_only');
    expect(sql).toContain('CURRENT_TIMESTAMP');
    expect(sql).not.toMatch(/\b(DROP|TRUNCATE|DELETE\s+FROM)\b/i);
  });
});
