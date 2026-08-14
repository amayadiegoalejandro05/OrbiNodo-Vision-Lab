import { Pool } from 'pg';
import type { BackendEnvironment } from '../config/environment';
import type { HealthProbe } from '../domain/health-probe';

export interface PostgresHealthProbe extends HealthProbe {
  close: () => Promise<void>;
}

// Los campos separados evitan construir o imprimir una URL que contenga contraseña.
export function createPostgresHealthProbe(env: BackendEnvironment): PostgresHealthProbe {
  const pool = new Pool({
    host: env.ORBINODO_DATABASE_HOST,
    port: env.ORBINODO_DATABASE_PORT,
    database: env.ORBINODO_DATABASE_NAME,
    user: env.ORBINODO_DATABASE_USER,
    password: env.ORBINODO_DATABASE_PASSWORD,
    ssl: env.ORBINODO_DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false,
    max: 10,
    connectionTimeoutMillis: 3_000,
    idleTimeoutMillis: 30_000,
  });

  return {
    readServerTime: async () => {
      const result = await pool.query<{ server_time: Date }>({
        text: 'SELECT CURRENT_TIMESTAMP AS server_time',
      });
      const serverTime = result.rows[0]?.server_time;
      if (!(serverTime instanceof Date)) throw new Error('Hora de servidor no válida.');
      return serverTime;
    },
    close: async () => pool.end(),
  };
}
