import { describe, expect, it } from 'vitest';
import { authenticateDemo, hasDemoAccounts, isConfiguredDemoAccount, sha256, type DemoAccount } from './demo-auth';
import { getRolePermissions } from './role-permissions';

describe('acceso básico de la demo por roles', () => {
  it('genera el SHA-256 esperado', async () => {
    expect(await sha256('OrbinodoDemo2026!')).toBe(
      'a1468e3aa173f7a86f3798cce1c40cfb72788601b9c40104bdee0c2309fcdaf2',
    );
  });

  it('rechaza cuentas incompletas y credenciales incorrectas', async () => {
    const incomplete: DemoAccount = { role: 'programmer', displayName: 'Orbinodo', username: '', passwordHash: '' };
    expect(isConfiguredDemoAccount(incomplete)).toBe(false);
    expect(hasDemoAccounts([incomplete])).toBe(false);
    const account: DemoAccount = {
      role: 'programmer', displayName: 'Orbinodo', username: 'Orbinodo',
      passwordHash: await sha256('OrbinodoDemo2026!'),
    };
    await expect(authenticateDemo('otro', 'OrbinodoDemo2026!', [account])).resolves.toBeNull();
    await expect(authenticateDemo('Orbinodo', 'incorrecta', [account])).resolves.toBeNull();
  });

  it('devuelve una sesión con nombre y rol', async () => {
    const account: DemoAccount = {
      role: 'engineer1', displayName: 'Ingeniero 1', username: 'Ingeniero 1',
      passwordHash: await sha256('OrbinodoDemo2026!'),
    };
    await expect(authenticateDemo('Ingeniero 1', 'OrbinodoDemo2026!', [account])).resolves.toEqual({
      role: 'engineer1', displayName: 'Ingeniero 1', username: 'Ingeniero 1',
    });
  });

  it('aplica permisos distintos a los cuatro perfiles', () => {
    expect(getRolePermissions('programmer')).toMatchObject({ calibrator: true, editCameraOperations: false, viewAuditHistory: false });
    expect(getRolePermissions('manager')).toMatchObject({ calibrator: false, editCameraOperations: false, viewAuditHistory: true });
    expect(getRolePermissions('engineer1')).toMatchObject({ calibrator: false, editCameraOperations: true, viewAuditHistory: false });
    expect(getRolePermissions('engineer2')).toMatchObject({ calibrator: false, editCameraOperations: true, viewAuditHistory: false });
  });
});
