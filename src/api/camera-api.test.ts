import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoSecurityCameras } from '../data/demo-cameras';
import { getCamerasFromApi, updateCameraOperations } from './camera-api';

afterEach(() => vi.unstubAllGlobals());
const camera = demoSecurityCameras[0]!;

describe('cliente HTTP de cámaras', () => {
  it('lee cámaras exclusivamente desde /api/cameras', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ cameras: [camera] }), { status: 200 },
    ));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getCamerasFromApi()).resolves.toEqual([camera]);
    expect(fetchMock).toHaveBeenCalledWith('/api/cameras', {
      credentials: 'include',
    });
  });

  it('envía los cinco campos y usa la cámara confirmada por la API', async () => {
    const update = {
      status: 'En mantenimiento' as const,
      lastMaintenanceOn: camera.lastMaintenanceOn,
      nextMaintenanceOn: camera.nextMaintenanceOn,
      responsibleArea: camera.responsibleArea,
      notes: 'Cambio remoto',
    };
    const result = { camera: { ...camera, ...update }, changedFields: ['status', 'notes'] };
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify(result), { status: 200 },
    ));
    vi.stubGlobal('fetch', fetchMock);
    await expect(updateCameraOperations(camera.id, update)).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/cameras/${camera.id}/operations`,
      expect.objectContaining({ method: 'PATCH', credentials: 'include' }),
    );
  });

  it('muestra el mensaje backend sin recurrir a datos locales', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ message: 'Este perfil no puede editar cámaras.' }),
      { status: 403 },
    )));
    await expect(updateCameraOperations(camera.id, {
      status: camera.status, lastMaintenanceOn: camera.lastMaintenanceOn,
      nextMaintenanceOn: camera.nextMaintenanceOn,
      responsibleArea: camera.responsibleArea, notes: camera.notes,
    })).rejects.toThrow('Este perfil no puede editar cámaras.');
  });
});
