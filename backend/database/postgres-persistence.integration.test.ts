import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiApp } from '../app';
import { loadBackendEnvironment } from '../config/environment';
import type { SeedAccount } from './seed/seed-accounts';
import { createPostgresAuditService } from './postgres-audit-service';
import { createPostgresAuthService } from './postgres-auth-service';
import { createPostgresCameraService } from './postgres-camera-service';
import { createPostgresHealthProbe } from './postgres-health-probe';
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

function realApi() {
  return createApiApp({
    healthProbe: createPostgresHealthProbe(testPool),
    authService: createPostgresAuthService(testPool, {
      sessionHours: 8, idleMinutes: 30, loginMaxAttempts: 5,
      loginWindowMinutes: 15, loginBlockMinutes: 15,
    }),
    cameraService: createPostgresCameraService(testPool),
    auditService: createPostgresAuditService(testPool),
    cookieName: 'orbinodo_session', cookieSecure: false, sessionHours: 8,
    trustedProxyHops: 1,
  });
}

async function loginCookie(app: ReturnType<typeof realApi>, username: string): Promise<string> {
  const response = await app.inject({ method: 'POST', url: '/api/auth/login',
    payload: { username, password: '1234567890' } });
  expect(response.statusCode).toBe(200);
  return String(response.headers['set-cookie']).split(';')[0]!;
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

  it('recorre login, me y logout por HTTP real', async () => {
    const app = realApi();
    try {
      const cookie = await loginCookie(app, 'Ingeniero 1');
      const headers = { cookie };
      expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers })).statusCode)
        .toBe(200);
      expect((await app.inject({ method: 'POST', url: '/api/auth/logout', headers }))
        .statusCode).toBe(204);
      expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers })).statusCode)
        .toBe(401);
    } finally { await app.close(); }
  });

  it('lee cámaras y aplica errores HTTP reales', async () => {
    const app = realApi();
    try {
      const headers = { cookie: await loginCookie(app, 'Ingeniero 1') };
      const list = await app.inject({ method: 'GET', url: '/api/cameras', headers });
      expect(list.json().cameras).toHaveLength(10);
      expect((await app.inject({ method: 'GET', url: '/api/cameras/camera-03', headers }))
        .statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url: '/api/cameras/no-existe', headers }))
        .statusCode).toBe(404);
      expect((await app.inject({ method: 'GET', url: '/api/no-existe', headers }))
        .json().error).toBe('ROUTE_NOT_FOUND');
    } finally { await app.close(); }
  });

  it('actualiza y consulta auditoría por HTTP real', async () => {
    const app = realApi();
    try {
      const engineer = { cookie: await loginCookie(app, 'Ingeniero 2') };
      const update = await app.inject({ method: 'PATCH',
        url: '/api/cameras/camera-03/operations', headers: engineer,
        payload: { status: 'En mantenimiento', lastMaintenanceOn: '2026-08-01',
          nextMaintenanceOn: '2026-12-01', responsibleArea: 'Seguridad',
          notes: 'Integración HTTP de Fase 2.' } });
      expect(update.statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url: '/api/audit/camera-changes',
        headers: engineer })).statusCode).toBe(403);
      const manager = { cookie: await loginCookie(app, 'Jefe') };
      const audit = await app.inject({ method: 'GET', url: '/api/audit/camera-changes',
        headers: manager });
      expect(audit.json().cameraChanges[0]).toMatchObject({ cameraId: 'camera-03' });
      const access = await app.inject({ method: 'GET', url: '/api/audit/access-sessions',
        headers: manager });
      expect(access.statusCode).toBe(200);
      expect(access.json().accessSessions.length).toBeGreaterThanOrEqual(2);
    } finally { await app.close(); }
  });

  it('separa rate limit por IP detrás del proxy configurado', async () => {
    const app = realApi();
    try {
      const before = await testPool.query('SELECT count(*)::int AS total FROM login_rate_limits');
      for (const ip of ['198.51.100.20', '198.51.100.21']) {
        const response = await app.inject({ method: 'POST', url: '/api/auth/login',
          headers: { 'x-forwarded-for': ip },
          payload: { username: '__missing_phase2__', password: '1234567890' } });
        expect(response.statusCode).toBe(401);
      }
      const after = await testPool.query('SELECT count(*)::int AS total FROM login_rate_limits');
      expect(after.rows[0].total).toBe(before.rows[0].total + 2);
    } finally { await app.close(); }
  });
});
