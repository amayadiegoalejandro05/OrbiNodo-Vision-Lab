import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getClientProfile, listClientProfileIds } from './client-profiles';
import { listPanoramas, validateTour } from '../src/domain/validate-tour';

describe('separacion Core y perfil de cliente', () => {
  it('registra un perfil por instancia dedicada y mantiene coherencia entre recorrido y activos', () => {
    const profile = getClientProfile('orbinodo-demo');
    expect(listClientProfileIds()).toEqual(['orbinodo-demo', 'vision-lab']);
    expect(profile.deploymentModel).toBe('dedicated-instance');
    expect(validateTour(profile.tour)).toEqual([]);
    expect(new Set(profile.cameras.map((camera) => camera.panoramaId))).toEqual(
      new Set(listPanoramas(profile.tour).map((panorama) => panorama.id)),
    );
  });

  it('mantiene el perfil Vision Lab como instancia dedicada minima', () => {
    const profile = getClientProfile('vision-lab');
    expect(profile.deploymentModel).toBe('dedicated-instance');
    expect(validateTour(profile.tour)).toEqual([]);
    expect(profile.cameras).toHaveLength(1);
    expect(profile.cameras[0]).toMatchObject({ id: 'camera-01', assetCode: 'CAM-ROBOT-01' });
  });

  it('impide que el seed del backend dependa de datos ubicados dentro de src', async () => {
    const seedRunner = await readFile(
      resolve(process.cwd(), 'backend/database/seed/seed-runner.ts'),
      'utf8',
    );
    expect(seedRunner).not.toContain('/src/data/');
    expect(seedRunner).toContain('getClientProfile');
  });
});
