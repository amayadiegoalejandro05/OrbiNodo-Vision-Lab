import { afterEach, describe, expect, it } from 'vitest';
import { loadBackendEnvironment } from './environment';

const originalEnvironment = {
  APP_ENV: process.env.APP_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  POSTGRES_URL: process.env.POSTGRES_URL,
  VISION_LAB_DATABASE_HOST: process.env.VISION_LAB_DATABASE_HOST,
  ORBINODO_SESSION_HOURS: process.env.ORBINODO_SESSION_HOURS,
  ORBINODO_COOKIE_SECURE: process.env.ORBINODO_COOKIE_SECURE,
  NODE_ENV: process.env.NODE_ENV,
  VERCEL_ENV: process.env.VERCEL_ENV,
};

function restore(name: keyof typeof originalEnvironment): void {
  const value = originalEnvironment[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function useVisionLabDatabase(): void {
  process.env.APP_ENV = 'vision-lab';
  process.env.DATABASE_URL = 'postgresql://vision_user:test-only@ep-vision-lab.example.neon.tech/neondb?sslmode=require';
  process.env.VISION_LAB_DATABASE_HOST = 'ep-vision-lab.example.neon.tech';
  delete process.env.POSTGRES_URL;
}

afterEach(() => {
  for (const name of Object.keys(originalEnvironment) as Array<keyof typeof originalEnvironment>) restore(name);
});

describe('configuracion aislada de Vision Lab', () => {
  it('acepta una configuracion del Lab con sesion de ocho horas', () => {
    useVisionLabDatabase();
    process.env.ORBINODO_SESSION_HOURS = '8';
    expect(loadBackendEnvironment().ORBINODO_SESSION_HOURS).toBe(8);
  });

  it('rechaza una duracion de sesion superior a ocho horas', () => {
    useVisionLabDatabase();
    process.env.ORBINODO_SESSION_HOURS = '9';
    expect(() => loadBackendEnvironment()).toThrow(/ORBINODO_SESSION_HOURS/);
  });

  it('rechaza cookies inseguras en produccion', () => {
    useVisionLabDatabase();
    process.env.NODE_ENV = 'production';
    process.env.VERCEL_ENV = 'production';
    process.env.ORBINODO_COOKIE_SECURE = 'false';
    expect(() => loadBackendEnvironment()).toThrow(/ORBINODO_COOKIE_SECURE/);
  });

  it('rechaza una URL que no pertenece al host autorizado del Lab sin revelar la cadena de conexion', () => {
    useVisionLabDatabase();
    process.env.DATABASE_URL = 'postgresql://core_user:test-only@ep-orbinodo-core.example.neon.tech/neondb?sslmode=require';
    let message = '';
    try {
      loadBackendEnvironment();
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }
    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('postgresql://');
    expect(message).not.toContain('core_user');
  });
});
