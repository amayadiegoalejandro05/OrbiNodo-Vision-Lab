import type { PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { resetDemoData } from './reset-demo';

describe('reinicio de la demostración', () => {
  it('limpia historiales y restaura exactamente diez estados en una transacción', async () => {
    const query = vi.fn(async (request: string | { text: string }) => {
      if (typeof request === 'object') return { rowCount: 1, rows: [] };
      if (request.startsWith('SELECT\n')) {
        return { rows: [{
          users: 4, cameras: 10, operationalStates: 10,
          accessSessions: 0, cameraChanges: 0,
        }] };
      }
      return { rowCount: 0, rows: [] };
    });
    const client = { query } as unknown as PoolClient;

    const result = await resetDemoData(client);

    expect(result).toMatchObject({ users: 4, cameras: 10, accessSessions: 0, cameraChanges: 0 });
    expect(query).toHaveBeenCalledWith(
      'TRUNCATE access_sessions, camera_change_history RESTART IDENTITY',
    );
    expect(query.mock.calls.filter(([value]) => typeof value === 'object')).toHaveLength(10);
    expect(query).toHaveBeenCalledWith('COMMIT');
  });
});
