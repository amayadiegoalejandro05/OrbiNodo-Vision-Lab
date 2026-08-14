import { Pool, type PoolConfig } from 'pg';
import type { BackendEnvironment } from '../config/environment';

// Centralizar estas opciones evita que salud, migraciones y rutas construyan
// conexiones distintas o impriman una URL que contenga la contraseña.
export function createPostgresOptions(env: BackendEnvironment): PoolConfig {
  return {
    host: env.ORBINODO_DATABASE_HOST,
    port: env.ORBINODO_DATABASE_PORT,
    database: env.ORBINODO_DATABASE_NAME,
    user: env.ORBINODO_DATABASE_USER,
    password: env.ORBINODO_DATABASE_PASSWORD,
    ssl: env.ORBINODO_DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false,
    max: 10,
    connectionTimeoutMillis: 3_000,
    idleTimeoutMillis: 30_000,
  };
}

export function createPostgresPool(env: BackendEnvironment): Pool {
  return new Pool(createPostgresOptions(env));
}
