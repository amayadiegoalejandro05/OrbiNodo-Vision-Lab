import { loadBackendEnvironment } from '../backend/config/environment';
import { createPostgresPool } from '../backend/database/postgres-options';

const username = process.argv[2]?.trim();
if (!username) throw new Error('Indica el nombre público del usuario.');

const pool = createPostgresPool(loadBackendEnvironment());
try {
  const result = await pool.query({
    text: `UPDATE access_sessions s
      SET status = 'logged_out', logout_at = CURRENT_TIMESTAMP, ended_at = CURRENT_TIMESTAMP
      FROM users u
      WHERE u.id = s.user_id AND lower(u.username) = lower($1)
        AND s.status = 'active' AND s.expires_at > CURRENT_TIMESTAMP
      RETURNING s.id`,
    values: [username],
  });
  console.log(`Sesiones cerradas para ${username}: ${result.rowCount ?? 0}`);
} finally {
  await pool.end();
}
