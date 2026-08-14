import type { Pool } from 'pg';
import type { HealthProbe } from '../domain/health-probe';

// Los campos separados evitan construir o imprimir una URL que contenga contraseña.
export function createPostgresHealthProbe(pool: Pool): HealthProbe {
  return {
    readServerTime: async () => {
      const result = await pool.query<{ server_time: Date }>({
        text: 'SELECT CURRENT_TIMESTAMP AS server_time',
      });
      const serverTime = result.rows[0]?.server_time;
      if (!(serverTime instanceof Date)) throw new Error('Hora de servidor no válida.');
      return serverTime;
    },
  };
}
