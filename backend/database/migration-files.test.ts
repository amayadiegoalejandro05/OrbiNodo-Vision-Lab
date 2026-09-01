import { describe, expect, it } from 'vitest';
import { loadMigrationFiles } from './migration-files';

describe('migraciones SQL de Orbinodo', () => {
  it('mantiene una versión inicial íntegra y con las entidades obligatorias', async () => {
    const migrations = await loadMigrationFiles();

    expect(migrations.map((item) => item.version)).toEqual([
      '0001_initial_schema.sql',
      '0002_access_history_view.sql',
      '0003_camera_change_history_view.sql',
      '0004_session_activity_and_login_rate_limits.sql',
      '0005_harden_camera_change_history.sql',
      '0006_session_history_consistency.sql',
      '0007_session_history_view_expiration.sql',
      '0008_camera_operational_lock_version.sql',
    ]);
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

  it('incluye una vista legible del historial de accesos', async () => {
    const viewSql = (await loadMigrationFiles())[1]?.sql ?? '';
    expect(viewSql).toContain('CREATE VIEW vista_historial_accesos');
    expect(viewSql).toContain("AT TIME ZONE 'America/Bogota'");
    expect(viewSql).toContain('"Duración"');
    expect(viewSql).not.toMatch(/session_token_hash|password_hash/i);
  });

  it('protege auditoría, usa hora del servidor y no contiene borrados', async () => {
    const sql = (await loadMigrationFiles())[0]?.sql ?? '';

    expect(sql).toContain('camera_change_history_append_only');
    expect(sql).toContain('CURRENT_TIMESTAMP');
    expect(sql).not.toMatch(/\b(DROP|TRUNCATE|DELETE\s+FROM)\b/i);
  });

  it('incluye una vista legible de cambios sin datos sensibles', async () => {
    const viewSql = (await loadMigrationFiles())[2]?.sql ?? '';
    expect(viewSql).toContain('CREATE VIEW vista_historial_cambios');
    expect(viewSql).toContain('"Valor anterior"');
    expect(viewSql).toContain("AT TIME ZONE 'America/Bogota'");
    expect(viewSql).not.toMatch(/session_token_hash|password_hash/i);
  });

  it('versiona actividad de sesión y rate limiting compartido', async () => {
    const sql = (await loadMigrationFiles())[3]?.sql ?? '';
    expect(sql).toContain('last_activity_at');
    expect(sql).toContain('idle_expires_at');
    expect(sql).toContain('CREATE TABLE login_rate_limits');
    expect(sql).toContain('CREATE OR REPLACE VIEW vista_historial_accesos');
  });

  it('protege el historial contra truncamiento y conserva el rol histórico', async () => {
    const sql = (await loadMigrationFiles())[4]?.sql ?? '';
    expect(sql).toContain('actor_role');
    expect(sql).toContain('BEFORE TRUNCATE ON camera_change_history');
  });

  it('includes a consistent session end history', async () => {
    const sql = (await loadMigrationFiles())[5]?.sql ?? '';
    expect(sql).toContain('ended_at');
    expect(sql).toContain('access_session_terminal_end');
    expect(sql).toContain('access_sessions_login_history_idx');
    expect(sql).toContain('CREATE VIEW vista_historial_accesos');
  });
});
