import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  authenticateWithApi, endApiSession, getActiveApiSession,
} from './demo-auth';
import { getRolePermissions } from './role-permissions';

afterEach(() => vi.unstubAllGlobals());

const user = {
  role: 'engineer1', displayName: 'Ingeniero 1', username: 'Ingeniero 1',
};

describe('autenticación mediante API de OrbiNodo', () => {
  it('envía credenciales al backend y acepta el perfil validado', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ user }), { status: 200 },
    ));
    vi.stubGlobal('fetch', fetchMock);
    await expect(authenticateWithApi(' Ingeniero 1 ', '1234567890'))
      .resolves.toEqual(user);
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
      method: 'POST', credentials: 'include',
    }));
  });

  it('trata 401 como credenciales o sesión inválida', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })));
    await expect(authenticateWithApi('nadie', 'incorrecta0')).resolves.toBeNull();
    await expect(getActiveApiSession()).resolves.toBeNull();
  });

  it('conserva el mensaje del backend cuando limita intentos', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: 'LOGIN_RATE_LIMITED',
      message: 'Demasiados intentos. Intenta nuevamente más tarde.',
    }), { status: 429 })));
    await expect(authenticateWithApi('vision-admin', '1234567890')).rejects.toMatchObject({
      code: 'LOGIN_RATE_LIMITED',
      message: 'Demasiados intentos. Intenta nuevamente más tarde.',
    });
  });

  it('restaura el perfil y solicita logout con la cookie', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ user }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getActiveApiSession()).resolves.toEqual(user);
    await expect(endApiSession()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenLastCalledWith('/api/auth/logout', {
      method: 'POST', credentials: 'include',
    });
  });

  it('conserva permisos distintos para los cuatro perfiles', () => {
    expect(getRolePermissions('programmer')).toMatchObject({
      calibrator: true, editCameraOperations: false, viewAuditHistory: false,
    });
    expect(getRolePermissions('manager')).toMatchObject({
      calibrator: false, editCameraOperations: false, viewAuditHistory: true,
    });
    expect(getRolePermissions('engineer1').editCameraOperations).toBe(true);
    expect(getRolePermissions('engineer2').editCameraOperations).toBe(true);
  });
});
