import { afterEach, describe, expect, it } from 'vitest';
import { loadBackendEnvironment } from './environment';

const originalHours = process.env.ORBINODO_SESSION_HOURS;

afterEach(() => {
  if (originalHours === undefined) delete process.env.ORBINODO_SESSION_HOURS;
  else process.env.ORBINODO_SESSION_HOURS = originalHours;
});

describe('límite absoluto de sesión', () => {
  it('acepta como máximo ocho horas', () => {
    process.env.ORBINODO_SESSION_HOURS = '8';
    expect(loadBackendEnvironment().ORBINODO_SESSION_HOURS).toBe(8);
  });

  it('rechaza una duración superior a ocho horas', () => {
    process.env.ORBINODO_SESSION_HOURS = '9';
    expect(() => loadBackendEnvironment()).toThrow(/ORBINODO_SESSION_HOURS/);
  });
});
  it('rejects insecure cookies in production', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalVercelEnv = process.env.VERCEL_ENV;
    const originalCookieSecure = process.env.ORBINODO_COOKIE_SECURE;
    try {
      process.env.NODE_ENV = 'production';
      process.env.VERCEL_ENV = 'production';
      process.env.ORBINODO_COOKIE_SECURE = 'false';
      expect(() => loadBackendEnvironment()).toThrow(/ORBINODO_COOKIE_SECURE/);
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
      if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = originalVercelEnv;
      if (originalCookieSecure === undefined) delete process.env.ORBINODO_COOKIE_SECURE;
      else process.env.ORBINODO_COOKIE_SECURE = originalCookieSecure;
    }
  });
