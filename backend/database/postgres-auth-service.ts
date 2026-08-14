import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { AuthRole, AuthService, AuthUser, LoginResult } from '../domain/auth-service';
import { verifyPassword } from '../security/password-hash';

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  role: AuthRole;
}

function tokenHash(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

function publicUser(row: UserRow): AuthUser {
  return { username: row.username, displayName: row.display_name, role: row.role };
}

export function createPostgresAuthService(pool: Pool, sessionHours: number): AuthService {
  async function login(username: string, password: string): Promise<LoginResult | null> {
    const found = await pool.query<UserRow>({
      text: `SELECT id, username, display_name, password_hash, role
        FROM users WHERE lower(username) = lower($1) AND is_active = true`,
      values: [username],
    });
    const user = found.rows[0];
    if (!user || !(await verifyPassword(password, user.password_hash))) return null;

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
        return null;
      }
      const inserted = await client.query<{ expires_at: Date }>({
        text: `INSERT INTO access_sessions
          (id, user_id, session_token_hash, expires_at)
          VALUES ($1, $2, $3, CURRENT_TIMESTAMP + make_interval(hours => $4))
          RETURNING expires_at`,
        values: [randomUUID(), user.id, tokenHash(token), sessionHours],
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
    await pool.query({
      text: `UPDATE access_sessions SET status = 'expired'
        WHERE session_token_hash = $1 AND status = 'active'
          AND expires_at <= CURRENT_TIMESTAMP`,
      values: [hash],
    });
    const result = await pool.query<UserRow>({
      text: `SELECT u.id, u.username, u.display_name, u.password_hash, u.role
        FROM access_sessions s JOIN users u ON u.id = s.user_id
        WHERE s.session_token_hash = $1 AND s.status = 'active'
          AND s.expires_at > CURRENT_TIMESTAMP AND u.is_active = true`,
      values: [hash],
    });
    return result.rows[0] ? publicUser(result.rows[0]) : null;
  }

  async function logout(token: string): Promise<void> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return;
    await pool.query({
      text: `UPDATE access_sessions
        SET status = CASE WHEN expires_at <= CURRENT_TIMESTAMP
          THEN 'expired' ELSE 'logged_out' END,
          logout_at = CASE WHEN expires_at > CURRENT_TIMESTAMP
            THEN CURRENT_TIMESTAMP ELSE logout_at END
        WHERE session_token_hash = $1 AND status = 'active'`,
      values: [tokenHash(token)],
    });
  }

  return { login, getSession, logout };
}
