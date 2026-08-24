import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadBackendEnvironment } from '../config/environment';
import type { SeedAccount } from './seed/seed-accounts';
import { createPostgresAuditService } from './postgres-audit-service';
import { createPostgresCameraService } from './postgres-camera-service';
import { createPostgresOptions } from './postgres-options';
import { runMigrations } from './migration-runner';
import { runSeed } from './seed/seed-runner';

const accounts: SeedAccount[] = [
  { username: 'Orbinodo', displayName: 'Orbinodo', role: 'programmer', password: '1234567890' },
  { username: 'Jefe', displayName: 'Jefe', role: 'manager', password: '1234567890' },
  { username: 'Ingeniero 1', displayName: 'Ingeniero 1', role: 'engineer1', password: '1234567890' },
  { username: 'Ingeniero 2', displayName: 'Ingeniero 2', role: 'engineer2', password: '1234567890' },
];
const databaseName = 'orbinodo_phase1_test_' + randomUUID().replaceAll('-', '');
let adminPool: Pool;
let testPool: Pool;
let testEnvironment: ReturnType<typeof loadBackendEnvironment>;
let databaseCreated = false;

function quotedDatabase(name: string): string {
  if (!/^orbinodo_phase1_test_[a-f0-9]{32}$/.test(name)) {
    throw new Error('Nombre inseguro para la base temporal.');
  }
  return `"${name}"`;
}

beforeAll(async () => {
  const environment = loadBackendEnvironment();
  if (environment.DATABASE_URL || environment.POSTGRES_URL
    || !['127.0.0.1', 'localhost'].includes(environment.ORBINODO_DATABASE_HOST)) {
    throw new Error('La prueba de Fase 1 solo puede ejecutarse contra PostgreSQL local.');
  }
  const options = createPostgresOptions(environment);
  adminPool = new Pool({ ...options, database: 'postgres', max: 1 });
  await adminPool.query(`CREATE DATABASE ${quotedDatabase(databaseName)}`);
  databaseCreated = true;
  testEnvironment = { ...environment, ORBINODO_DATABASE_NAME: databaseName };
  expect(await runMigrations(testEnvironment)).toEqual([
    '0001_initial_schema.sql', '0002_access_history_view.sql',
    '0003_camera_change_history_view.sql',
    '0004_session_activity_and_login_rate_limits.sql',
  ]);
  await runSeed(testEnvironment, accounts);
  testPool = new Pool(createPostgresOptions(testEnvironment));
}, 30_000);

afterAll(async () => {
  if (testPool) await testPool.end();
  if (!adminPool) return;
  if (!databaseCreated) {
    await adminPool.end();
    return;
  }
  await adminPool.query(
    'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
    [databaseName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS ${quotedDatabase(databaseName)}`);
  await adminPool.end();
}, 30_000);

describe.sequential('reconstrucción PostgreSQL de Fase 1', () => {
  it('crea desde cero las tablas empresariales', async () => {
    const result = await testPool.query<{ table_name: string }>(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`);
    expect(result.rows.map(({ table_name }) => table_name)).toEqual([
      'access_sessions', 'camera_change_history', 'camera_operational_state', 'cameras',
      'login_rate_limits', 'schema_migrations', 'users',
    ]);
  });

  it('crea las vistas empresariales', async () => {
    const result = await testPool.query<{ table_name: string }>(`
      SELECT table_name FROM information_schema.views
      WHERE table_schema = 'public' ORDER BY table_name`);
    expect(result.rows.map(({ table_name }) => table_name)).toEqual([
      'vista_historial_accesos', 'vista_historial_cambios',
    ]);
  });

  it('es idempotente para migraciones y seed', async () => {
    expect(await runMigrations(testEnvironment)).toEqual([]);
    await runSeed(testEnvironment, accounts);
    const result = await testPool.query(`SELECT
      (SELECT count(*)::int FROM schema_migrations) AS migrations,
      (SELECT count(*)::int FROM users) AS users,
      (SELECT count(*)::int FROM cameras) AS cameras`);
    expect(result.rows[0]).toEqual({ migrations: 4, users: 4, cameras: 10 });
  });

  it('crea integridad, índices y protección append-only', async () => {
    const result = await testPool.query(`SELECT
      (SELECT count(*)::int FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace AND contype = 'p') AS primary_keys,
      (SELECT count(*)::int FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace AND contype = 'f') AS foreign_keys,
      (SELECT count(*)::int FROM pg_indexes WHERE schemaname = 'public') AS indexes,
      (SELECT count(*)::int FROM pg_trigger WHERE NOT tgisinternal
        AND tgrelid = 'camera_change_history'::regclass) AS history_triggers`);
    expect(result.rows[0]).toMatchObject({
      primary_keys: 7, foreign_keys: 5, history_triggers: 1,
    });
    expect(result.rows[0].indexes).toBeGreaterThanOrEqual(13);
  });

  it('persiste cámara e historial al recrear el pool', async () => {
    const service = createPostgresCameraService(testPool);
    const camera = (await service.listCameras())[0]!;
    const result = await service.updateOperations(camera.id, {
      username: 'Ingeniero 1', displayName: 'Ingeniero 1', role: 'engineer1',
    }, {
      status: 'En mantenimiento', lastMaintenanceOn: camera.lastMaintenanceOn,
      nextMaintenanceOn: camera.nextMaintenanceOn,
      responsibleArea: camera.responsibleArea, notes: 'Persistencia Fase 1.',
    });
    expect(result?.changedFields).toEqual(['status', 'notes']);
    const audit = await createPostgresAuditService(testPool).listCameraChanges();
    expect(audit[0]).toMatchObject({ actorName: 'Ingeniero 1', cameraId: camera.id });
    await testPool.end();
    testPool = new Pool(createPostgresOptions(testEnvironment));
    expect(await createPostgresCameraService(testPool).getCamera(camera.id))
      .toMatchObject({ status: 'En mantenimiento', notes: 'Persistencia Fase 1.' });
  });

  it('revierte estado e historial si falla la actualización', async () => {
    const service = createPostgresCameraService(testPool);
    const camera = (await service.listCameras())[1]!;
    await expect(service.updateOperations(camera.id, {
      username: 'Ingeniero 2', displayName: 'Ingeniero 2', role: 'engineer2',
    }, { ...camera, notes: '' })).rejects.toBeDefined();
    expect(await service.getCamera(camera.id)).toMatchObject({ notes: camera.notes });
    const history = await testPool.query(
      'SELECT count(*)::int AS total FROM camera_change_history WHERE camera_id = $1',
      [camera.id],
    );
    expect(history.rows[0].total).toBe(0);
  });

  it('aplica referencias y protege el historial', async () => {
    const camera = (await createPostgresCameraService(testPool).listCameras())[0]!;
    await expect(testPool.query('DELETE FROM cameras WHERE id = $1', [camera.id]))
      .rejects.toMatchObject({ code: '23001' });
    await expect(testPool.query(
      'UPDATE camera_change_history SET new_value = old_value WHERE camera_id = $1',
      [camera.id],
    )).rejects.toBeDefined();
  });
});
