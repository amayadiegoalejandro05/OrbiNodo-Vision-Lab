import { describe, expect, it } from 'vitest';
import type { BackendEnvironment } from '../config/environment';
import { createPostgresOptions } from './postgres-options';

const localEnvironment = {
  ORBINODO_DATABASE_HOST: '127.0.0.1', ORBINODO_DATABASE_PORT: 5432,
  ORBINODO_DATABASE_NAME: 'orbinodo_demo', ORBINODO_DATABASE_USER: 'orbinodo_api',
  ORBINODO_DATABASE_PASSWORD: 'clave-local', ORBINODO_DATABASE_SSL: 'false',
} as BackendEnvironment;

describe('opciones PostgreSQL', () => {
  it('mantiene los parámetros separados para desarrollo local', () => {
    expect(createPostgresOptions(localEnvironment)).toMatchObject({
      host: '127.0.0.1', database: 'orbinodo_demo', user: 'orbinodo_api', ssl: false,
    });
  });

  it('prioriza DATABASE_URL para un proveedor administrado', () => {
    const connectionString = 'postgresql://usuario:clave@db.example/base?sslmode=require';
    const options = createPostgresOptions({
      ...localEnvironment, DATABASE_URL: connectionString,
    });
    expect(options).toMatchObject({
      connectionString: 'postgresql://usuario:clave@db.example/base?sslmode=verify-full',
      max: 5,
    });
    expect(options).not.toHaveProperty('host');
    expect(options).not.toHaveProperty('password');
  });
  it('requires verified TLS for a production URL', () => {
    const options = createPostgresOptions({
      ...localEnvironment, NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://usuario:clave@db.example/base',
    });
    expect(options).toMatchObject({
      connectionString: 'postgresql://usuario:clave@db.example/base?sslmode=verify-full',
    });
});
  });
