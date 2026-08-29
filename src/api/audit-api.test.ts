import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAuditFromApi } from './audit-api';

afterEach(() => vi.unstubAllGlobals());

describe('cliente HTTP de auditoría', () => {
  it('combina accesos y cambios obtenidos únicamente desde la API', async () => {
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(
      url.endsWith('access-sessions')
        ? { accessSessions: [{
            id: 'session-1', timestamp: '2026-08-14T04:00:00.000Z',
            role: 'manager', displayName: 'Jefe', username: 'Jefe', status: 'active',
          }] }
        : { cameraChanges: [] },
    ), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getAuditFromApi();

    expect(result.accessHistory).toHaveLength(1);
    expect(result.changeHistory).toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith('/api/audit/access-sessions', { credentials: 'include' });
    expect(fetchMock).toHaveBeenCalledWith('/api/audit/camera-changes', { credentials: 'include' });
  });
});
