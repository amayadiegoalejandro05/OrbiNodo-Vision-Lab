import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { AuthRole, AuthService, AuthUser, LoginContext, LoginResult } from '../domain/auth-service';
import { LoginRateLimitedError } from '../domain/auth-service.js';
import { verifyPassword } from '../security/password-hash.js';

const DUMMY_PASSWORD_HASH = '$argon2id$v=19$m=65536,t=3,p=1$OH6Z4CUOrlWgfAcvdRAqkw$QbHEeQSnIicoLDRTLQFszoDuloS_1f3hmTMFG79uxLc';

const SESSION_REFRESH_SQL = `UPDATE access_sessions s SET
    last_activity_at = CURRENT_TIMESTAMP,
    idle_expires_at = LEAST(s.expires_at,
      CURRENT_TIMESTAMP + make_interval(mins => $2))
  FROM users u WHERE u.id = s.user_id
    AND s.session_token_hash = $1 AND s.status = 'active'
    AND s.expires_at > CURRENT_TIMESTAMP
    AND s.idle_expires_at > CURRENT_TIMESTAMP AND u.is_active = true
  RETURNING u.id, u.username, u.display_name, u.password_hash, u.role`;

export interface PostgresAuthOptions {
  sessionHours: number;
  idleMinutes: number;
  loginMaxAttempts: number;
  loginWindowMinutes: number;
  loginBlockMinutes: number;
}

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  role: AuthRole;
}

interface RateLimitRow { is_blocked: boolean }

async function enforceLoginRateLimit(pool: Pool, key: Buffer): Promise<void> {
  const result = await pool.query<RateLimitRow>({
    text: `SELECT blocked_until > CURRENT_TIMESTAMP AS is_blocked
      FROM login_rate_limits WHERE attempt_key = $1`,
    values: [key],
  });
  if (result.rows[0]?.is_blocked) throw new LoginRateLimitedError();
}

async function recordLoginFailure(
  pool: Pool, key: Buffer, options: PostgresAuthOptions,
): Promise<void> {
  const result = await pool.query<RateLimitRow>({
    text: `INSERT INTO login_rate_limits
      (attempt_key, failed_attempts, blocked_until)
      VALUES ($1, 1, CASE WHEN $2 <= 1 THEN CURRENT_TIMESTAMP + make_interval(mins => $4) END)
      ON CONFLICT (attempt_key) DO UPDATE SET
        failed_attempts = CASE WHEN login_rate_limits.window_started_at <=
          CURRENT_TIMESTAMP - make_interval(mins => $3) THEN 1
          ELSE login_rate_limits.failed_attempts + 1 END,
        window_started_at = CASE WHEN login_rate_limits.window_started_at <=
          CURRENT_TIMESTAMP - make_interval(mins => $3) THEN CURRENT_TIMESTAMP
          ELSE login_rate_limits.window_started_at END,
        blocked_until = CASE
          WHEN login_rate_limits.blocked_until > CURRENT_TIMESTAMP THEN login_rate_limits.blocked_until
          WHEN login_rate_limits.window_started_at <= CURRENT_TIMESTAMP - make_interval(mins => $3)
            THEN CASE WHEN $2 <= 1 THEN CURRENT_TIMESTAMP + make_interval(mins => $4) END
          WHEN login_rate_limits.failed_attempts + 1 >= $2
            THEN CURRENT_TIMESTAMP + make_interval(mins => $4)
          ELSE NULL END,
        updated_at = CURRENT_TIMESTAMP
      RETURNING blocked_until > CURRENT_TIMESTAMP AS is_blocked`,
    values: [key, options.loginMaxAttempts, options.loginWindowMinutes,
      options.loginBlockMinutes],
  });
  if (result.rows[0]?.is_blocked) throw new LoginRateLimitedError();
}

async function clearLoginFailures(pool: Pool, key: Buffer): Promise<void> {
  await pool.query({
    text: 'DELETE FROM login_rate_limits WHERE attempt_key = $1', values: [key],
  });
}

function tokenHash(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

function loginAttemptKey(username: string, context: LoginContext): Buffer {
  return createHash('sha256')
    .update(username.trim().toLocaleLowerCase('es') + '\0' + context.sourceIp, 'utf8')
    .digest();
}

function publicUser(row: UserRow): AuthUser {
  return { username: row.username, displayName: row.display_name, role: row.role };
}

async function expireAbsoluteOrIdle(pool: Pool): Promise<void> {
  await pool.query(`UPDATE access_sessions SET status = 'expired',
      ended_at = COALESCE(ended_at, LEAST(expires_at, idle_expires_at))
    WHERE status = 'active'
      AND LEAST(expires_at, idle_expires_at) <= CURRENT_TIMESTAMP`);
}

async function revokeInactiveUsers(pool: Pool): Promise<void> {
  await pool.query(`UPDATE access_sessions s SET status = 'revoked',
      revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
      ended_at = COALESCE(ended_at, CURRENT_TIMESTAMP)
    FROM users u WHERE u.id = s.user_id AND u.is_active = false
      AND s.status = 'active'`);
}

export async function expireDueSessions(pool: Pool): Promise<void> {
  await expireAbsoluteOrIdle(pool);
  await revokeInactiveUsers(pool);
}

export function createPostgresAuthService(pool: Pool, options: PostgresAuthOptions): AuthService {
  async function login(
    username: string, password: string, context: LoginContext,
  ): Promise<LoginResult | null> {
    const attemptKey = loginAttemptKey(username, context);
    await expireDueSessions(pool);
    await enforceLoginRateLimit(pool, attemptKey);
    const found = await pool.query<UserRow>({
      text: `SELECT id, username, display_name, password_hash, role
        FROM users WHERE lower(username) = lower($1) AND is_active = true`,
      values: [username],
    });
    const user = found.rows[0];
    const passwordMatches = await verifyPassword(
      password, user?.password_hash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !passwordMatches) {
      await recordLoginFailure(pool, attemptKey, options);
      return null;
    }
    await clearLoginFailures(pool, attemptKey);

    const token = randomBytes(32).toString('base64url');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const active = await client.query<{ id: string }>({
        text: 'SELECT id FROM users WHERE id = $1 AND is_active = true FOR UPDATE',
        values: [user.id],
      });
      if (!active.rows[0]) {
        await client.query('ROLLBACK');
        await recordLoginFailure(pool, attemptKey, options);
        return null;
      }
      const inserted = await client.query<{ expires_at: Date }>({
        text: `INSERT INTO access_sessions
          (id, user_id, session_token_hash, expires_at, last_activity_at, idle_expires_at)
          VALUES ($1, $2, $3,
            CURRENT_TIMESTAMP + make_interval(hours => $4), CURRENT_TIMESTAMP,
            LEAST(CURRENT_TIMESTAMP + make_interval(hours => $4),
              CURRENT_TIMESTAMP + make_interval(mins => $5)))
          RETURNING expires_at`,
        values: [randomUUID(), user.id, tokenHash(token),
          options.sessionHours, options.idleMinutes],
      });
      await client.query('COMMIT');
      const expiresAt = inserted.rows[0]?.expires_at;
      if (!(expiresAt instanceof Date)) throw new Error('Invalid session expiration.');
      return { token, user: publicUser(user), expiresAt };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function getSession(token: string): Promise<AuthUser | null> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const hash = tokenHash(token);
    await expireDueSessions(pool);
    const result = await pool.query<UserRow>({
      text: SESSION_REFRESH_SQL,
      values: [hash, options.idleMinutes],
    });
    return result.rows[0] ? publicUser(result.rows[0]) : null;
  }

  async function logout(token: string): Promise<void> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return;
    await pool.query({
      text: `UPDATE access_sessions
        SET status = CASE WHEN LEAST(expires_at, idle_expires_at) <= CURRENT_TIMESTAMP
          THEN 'expired' ELSE 'logged_out' END,
          logout_at = CASE WHEN LEAST(expires_at, idle_expires_at) > CURRENT_TIMESTAMP
            THEN CURRENT_TIMESTAMP ELSE logout_at END
          , ended_at = CASE WHEN LEAST(expires_at, idle_expires_at) > CURRENT_TIMESTAMP
            THEN CURRENT_TIMESTAMP ELSE COALESCE(ended_at, LEAST(expires_at, idle_expires_at)) END
        WHERE session_token_hash = $1 AND status = 'active'`,
      values: [tokenHash(token)],
    });
  }

  return { login, getSession, logout };
}
