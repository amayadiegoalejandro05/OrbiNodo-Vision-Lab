import { Pool } from 'pg';
import type { BackendEnvironment } from '../config/environment';
import type { HealthProbe } from '../domain/health-probe';
import { createPostgresOptions } from './postgres-options';

export interface PostgresHealthProbe extends HealthProbe {
  close: () => Promise<void>;
}

// Los campos separados evitan construir o imprimir una URL que contenga contraseña.
export function createPostgresHealthProbe(env: BackendEnvironment): PostgresHealthProbe {
  const pool = new Pool(createPostgresOptions(env));

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
