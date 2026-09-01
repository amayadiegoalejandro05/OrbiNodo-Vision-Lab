import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadBackendEnvironment } from '../config/environment';
import { LoginRateLimitedError } from '../domain/auth-service.js';
import { hashPassword } from '../security/password-hash.js';
import { createPostgresAuthService, type PostgresAuthOptions } from './postgres-auth-service';
import { createPostgresAuditService } from './postgres-audit-service';
import { createPostgresOptions } from './postgres-options';

const USERNAME = '__orbinodo_auth_integration__';
const PASSWORD = '1234567890';
const SOURCE_IP = '198.51.100.77';
const MISSING_USERNAME = '__orbinodo_missing_integration__';
const options: PostgresAuthOptions = {
  sessionHours: 8,
  idleMinutes: 30,
  loginMaxAttempts: 5,
  loginWindowMinutes: 15,
  loginBlockMinutes: 15,
};

let pool: Pool;

function attemptKey(username: string): Buffer {
  return createHash('sha256')
    .update(username.toLocaleLowerCase('es') + '\0' + SOURCE_IP, 'utf8').digest();
}

function tokenHash(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

async function cleanTestData(): Promise<void> {
  await pool.query(`DELETE FROM access_sessions WHERE user_id IN (
    SELECT id FROM users WHERE username = $1
  )`, [USERNAME]);
  await pool.query('DELETE FROM users WHERE username = $1', [USERNAME]);
  await pool.query('DELETE FROM login_rate_limits WHERE attempt_key IN ($1, $2)', [
    attemptKey(USERNAME), attemptKey(MISSING_USERNAME),
  ]);
}

async function createTestUser(): Promise<void> {
  await pool.query(`INSERT INTO users
    (username, display_name, password_hash, role, is_active)
    VALUES ($1, 'Integración Auth', $2, 'programmer', true)`,
  [USERNAME, hashPassword(PASSWORD)]);
}

async function login(service = createPostgresAuthService(pool, options)) {
  return service.login(USERNAME, PASSWORD, { sourceIp: SOURCE_IP });
}

async function forceIdleExpiration(token: string): Promise<void> {
  await pool.query(`UPDATE access_sessions SET login_at = CURRENT_TIMESTAMP - interval '2 hours',
    last_activity_at = CURRENT_TIMESTAMP - interval '1 hour',
    idle_expires_at = CURRENT_TIMESTAMP - interval '1 minute'
    WHERE session_token_hash = $1`, [tokenHash(token)]);
}

async function sessionStatus(token: string): Promise<string | undefined> {
  const result = await pool.query<{ status: string }>(
    'SELECT status FROM access_sessions WHERE session_token_hash = $1', [tokenHash(token)],
  );
  return result.rows[0]?.status;
}

async function ageActiveSession(token: string): Promise<void> {
  await pool.query(`UPDATE access_sessions SET login_at = CURRENT_TIMESTAMP - interval '1 hour',
    last_activity_at = CURRENT_TIMESTAMP - interval '1 hour',
    idle_expires_at = CURRENT_TIMESTAMP + interval '1 minute'
    WHERE session_token_hash = $1`, [tokenHash(token)]);
}

interface SessionTimes { login_at: Date; last_activity_at: Date; expires_at: Date }
async function sessionTimes(token: string): Promise<SessionTimes> {
  const result = await pool.query<SessionTimes>(
    'SELECT login_at, last_activity_at, expires_at FROM access_sessions WHERE session_token_hash = $1',
    [tokenHash(token)],
  );
  return result.rows[0]!;
}

beforeAll(async () => {
  const environment = loadBackendEnvironment();
  if (environment.DATABASE_URL || environment.POSTGRES_URL
    || !['127.0.0.1', 'localhost'].includes(environment.ORBINODO_DATABASE_HOST)) {
    throw new Error('La integración de autenticación solo puede usar PostgreSQL local.');
  }
  pool = new Pool(createPostgresOptions(environment));
  await cleanTestData();
  await createTestUser();
});

beforeEach(async () => {
  await pool.query(`DELETE FROM access_sessions WHERE user_id = (
    SELECT id FROM users WHERE username = $1
  )`, [USERNAME]);
  await pool.query('DELETE FROM login_rate_limits WHERE attempt_key IN ($1, $2)', [
    attemptKey(USERNAME), attemptKey(MISSING_USERNAME),
  ]);
  await pool.query('UPDATE users SET is_active = true WHERE username = $1', [USERNAME]);
});

afterAll(async () => {
  if (!pool) return;
  await cleanTestData();
  await pool.end();
});

describe('sesiones PostgreSQL reales', () => {
  it('conserva la sesión cuando se recrea el servicio backend', async () => {
    const created = await login();
    expect(created).not.toBeNull();
    const restartedService = createPostgresAuthService(pool, options);
    expect(await restartedService.getSession(created!.token)).toMatchObject({
      username: USERNAME, role: 'programmer',
    });
  });

  it('refreshes activity without extending absolute expiration', async () => {
    const created = await login();
    await ageActiveSession(created!.token);
    const before = await sessionTimes(created!.token);

    await createPostgresAuthService(pool, options).getSession(created!.token);
    const after = await sessionTimes(created!.token);

    expect(after.last_activity_at.getTime()).toBeGreaterThan(after.login_at.getTime());
    expect(after.expires_at.toISOString()).toBe(before.expires_at.toISOString());
  });

  it('invalida y marca la expiración absoluta', async () => {
    const created = await login();
    await pool.query(`UPDATE access_sessions SET
      login_at = CURRENT_TIMESTAMP - interval '9 hours',
      last_activity_at = CURRENT_TIMESTAMP - interval '2 minutes',
      expires_at = CURRENT_TIMESTAMP - interval '1 minute',
      idle_expires_at = CURRENT_TIMESTAMP - interval '1 minute'
      WHERE session_token_hash = $1`, [tokenHash(created!.token)]);
    expect(await createPostgresAuthService(pool, options).getSession(created!.token)).toBeNull();
    const state = await pool.query<{ status: string; ended_at: Date }>(
      'SELECT status, ended_at FROM access_sessions WHERE session_token_hash = $1',
      [tokenHash(created!.token)],
    );
    expect(state.rows[0]?.status).toBe('expired');
    expect(state.rows[0]?.ended_at).toBeInstanceOf(Date);

    const view = await pool.query<{ salida: string; estado: string; duracion: string }>(
      'SELECT salida, estado, duracion FROM vista_historial_accesos WHERE usuario = $1 LIMIT 1',
      ['Integración Auth'],
    );
    expect(view.rows[0]?.salida).not.toBe('Sesion abierta');
    expect(view.rows[0]?.estado).toBe('Expirada');
    expect(view.rows[0]?.duracion).not.toBe('En curso');
  });

  it('aplica el timeout por inactividad sin esperar ocho horas', async () => {
    const created = await login();
    await forceIdleExpiration(created!.token);
    const service = createPostgresAuthService(pool, options);
    expect(await service.getSession(created!.token)).toBeNull();
    expect(await sessionStatus(created!.token)).toBe('expired');
  });

  it('shows a due session as expired in the administrative view before API cleanup', async () => {
    const created = await login();
    await forceIdleExpiration(created!.token);
    const view = await pool.query<{ salida: string; estado: string; duracion: string }>(
      'SELECT salida, estado, duracion FROM vista_historial_accesos WHERE usuario = $1 LIMIT 1',
      ['Integración Auth'],
    );
    expect(view.rows[0]?.salida).not.toBe('Sesion abierta');
    expect(view.rows[0]?.estado).toBe('Expirada');
    expect(view.rows[0]?.duracion).not.toBe('En curso');
  });

  it('persists logout as a terminal audit event with duration', async () => {
    const created = await login();
    const service = createPostgresAuthService(pool, options);
    await service.logout(created!.token);
    const stored = await pool.query<{ id: string; status: string; logout_at: Date; ended_at: Date }>(
      'SELECT id, status, logout_at, ended_at FROM access_sessions WHERE session_token_hash = $1',
      [tokenHash(created!.token)],
    );
    expect(stored.rows[0]).toMatchObject({ status: 'logged_out' });
    expect(stored.rows[0]?.logout_at).toBeInstanceOf(Date);
    expect(stored.rows[0]?.ended_at).toBeInstanceOf(Date);

    const auditEntry = (await createPostgresAuditService(pool).listAccessSessions())
      .find((item) => item.id === stored.rows[0]?.id);
    expect(auditEntry).toMatchObject({ status: 'logged_out' });
    expect(auditEntry?.endedAt).toBeDefined();
    expect(auditEntry?.durationSeconds).toBeGreaterThanOrEqual(0);
  });

  it('revoca la sesión cuando el usuario fue desactivado', async () => {
    const created = await login();
    await pool.query('UPDATE users SET is_active = false WHERE username = $1', [USERNAME]);
    const service = createPostgresAuthService(pool, options);
    expect(await service.getSession(created!.token)).toBeNull();
    expect(await sessionStatus(created!.token)).toBe('revoked');
  });

  it('mantiene consistentes varias sesiones concurrentes', async () => {
    const service = createPostgresAuthService(pool, options)
    const results = await Promise.all([
      service.login(USERNAME, PASSWORD, { sourceIp: SOURCE_IP }),
      service.login(USERNAME, PASSWORD, { sourceIp: '198.51.100.78' }),
      service.login(USERNAME, PASSWORD, { sourceIp: '198.51.100.79' }),
    ])
    expect(results.every((item) => item !== null)).toBe(true)
    const tokens = results.map((item) => item!.token)
    expect(new Set(tokens).size).toBe(3)
    await expect(Promise.all(tokens.map((token) => service.getSession(token))))
      .resolves.toHaveLength(3)
  })
  it('comparte el rate limiting entre instancias del servicio', async () => {
    const limitedOptions = { ...options, loginMaxAttempts: 2 };
    const firstService = createPostgresAuthService(pool, limitedOptions);
    const context = { sourceIp: SOURCE_IP };
    expect(await firstService.login(MISSING_USERNAME, PASSWORD, context)).toBeNull();
    await expect(firstService.login(MISSING_USERNAME, PASSWORD, context))
      .rejects.toBeInstanceOf(LoginRateLimitedError);
    const restartedService = createPostgresAuthService(pool, limitedOptions);
    await expect(restartedService.login(MISSING_USERNAME, PASSWORD, context))
      .rejects.toBeInstanceOf(LoginRateLimitedError);
  });
});
