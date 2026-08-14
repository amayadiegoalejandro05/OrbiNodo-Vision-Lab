import { describe, expect, it } from 'vitest';
import type { DemoSession } from '../auth/demo-auth';
import {
  getAccessHistory,
  getCameraRecords,
  getChangeHistory,
  recordSuccessfulLogin,
  recordSuccessfulLogout,
  saveCameraOperationalUpdate,
} from './demo-operations-store';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const engineer: DemoSession = { role: 'engineer1', displayName: 'Ingeniero 1', username: 'Ingeniero 1' };

describe('persistencia local de operaciones CCTV', () => {
  it('registra acceso, cierre explícito y duración de la sesión', () => {
    const storage = new MemoryStorage();
    const sessionStore = new MemoryStorage();
    recordSuccessfulLogin(engineer, storage, sessionStore, new Date('2026-08-10T10:00:00Z'));
    recordSuccessfulLogout(storage, sessionStore, new Date('2026-08-10T10:12:34Z'));
    expect(getAccessHistory(storage)).toMatchObject([{
      displayName: 'Ingeniero 1',
      role: 'engineer1',
      logoutAt: '2026-08-10T10:12:34.000Z',
      durationSeconds: 754,
    }]);
  });

  it('conserva sin cierre una sesión cuando no se usa el botón Cerrar sesión', () => {
    const storage = new MemoryStorage();
    const sessionStore = new MemoryStorage();
    recordSuccessfulLogin(engineer, storage, sessionStore, new Date('2026-08-10T10:00:00Z'));
    expect(getAccessHistory(storage)[0]).not.toHaveProperty('durationSeconds');
  });

  it('guarda solamente campos operativos y genera un historial explícito', () => {
    const storage = new MemoryStorage();
    const current = getCameraRecords(storage)[0]!;
    const result = saveCameraOperationalUpdate(current.id, {
      status: 'En mantenimiento',
      lastMaintenanceOn: '2026-08-10',
      nextMaintenanceOn: '2026-11-10',
      responsibleArea: 'Mantenimiento CCTV',
      notes: 'Se programó cambio preventivo del soporte.',
    }, engineer, storage);
    expect(result.camera).toMatchObject({
      id: current.id,
      model: current.model,
      status: 'En mantenimiento',
      responsibleArea: 'Mantenimiento CCTV',
    });
    expect(getChangeHistory(storage)[0]).toMatchObject({
      actorName: 'Ingeniero 1',
      cameraName: current.name,
    });
    expect(getChangeHistory(storage)[0]?.changes.map(({ label }) => label)).toContain('Estado operativo');
  });

  it('impide que Jefe y Orbinodo editen datos operativos', () => {
    const storage = new MemoryStorage();
    const current = getCameraRecords(storage)[0]!;
    const update = {
      status: current.status,
      lastMaintenanceOn: current.lastMaintenanceOn,
      nextMaintenanceOn: current.nextMaintenanceOn,
      responsibleArea: current.responsibleArea,
      notes: current.notes,
    };
    expect(() => saveCameraOperationalUpdate(current.id, update, { role: 'manager', displayName: 'Jefe', username: 'Jefe' }, storage)).toThrow();
    expect(() => saveCameraOperationalUpdate(current.id, update, { role: 'programmer', displayName: 'Orbinodo', username: 'Orbinodo' }, storage)).toThrow();
  });
});
