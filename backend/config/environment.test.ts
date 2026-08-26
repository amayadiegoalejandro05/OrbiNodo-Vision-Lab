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
