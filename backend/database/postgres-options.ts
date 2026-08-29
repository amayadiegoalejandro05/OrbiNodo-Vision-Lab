import { Pool, type PoolConfig } from 'pg';
import { isProductionDeployment, type BackendEnvironment } from '../config/environment.js';

// Centralizar estas opciones evita que salud, migraciones y rutas construyan
// conexiones distintas o impriman una URL que contenga la contraseña.
export function createPostgresOptions(env: BackendEnvironment): PoolConfig {
  const connectionString = env.DATABASE_URL ?? env.POSTGRES_URL;
  if (connectionString) {
    const url = new URL(connectionString);
    const sslMode = url.searchParams.get('sslmode');
    if (isProductionDeployment(env) || sslMode === 'prefer' || sslMode === 'require' || sslMode === 'verify-ca') {
      url.searchParams.set('sslmode', 'verify-full');
    }
    return {
      connectionString: url.toString(),
      max: 5,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
    };
  }
  return {
    host: env.ORBINODO_DATABASE_HOST,
    port: env.ORBINODO_DATABASE_PORT,
    database: env.ORBINODO_DATABASE_NAME,
    user: env.ORBINODO_DATABASE_USER,
    password: env.ORBINODO_DATABASE_PASSWORD,
    ssl: isProductionDeployment(env) || env.ORBINODO_DATABASE_SSL === 'true'
      ? { rejectUnauthorized: true } : false,
    max: 10,
    connectionTimeoutMillis: 3_000,
    idleTimeoutMillis: 30_000,
  };
}

export function createPostgresPool(env: BackendEnvironment): Pool {
  return new Pool(createPostgresOptions(env));
}
