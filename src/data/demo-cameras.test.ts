import { describe, expect, it } from 'vitest';
import { demoSecurityCameras } from './demo-cameras';
import { demoTour } from './demo-tour';
import { listPanoramas } from '../domain/validate-tour';

describe('inventario ficticio de cámaras CCTV', () => {
  it('contiene una cámara por cada panorama de la demo', () => {
    const panoramaIds = listPanoramas(demoTour).map(({ id }) => id).sort();
    const cameraPanoramaIds = demoSecurityCameras.map(({ panoramaId }) => panoramaId).sort();
    expect(demoSecurityCameras).toHaveLength(10);
    expect(cameraPanoramaIds).toEqual(panoramaIds);
  });

  it('usa identificadores únicos y ángulos válidos', () => {
    expect(new Set(demoSecurityCameras.map(({ id }) => id)).size).toBe(10);
    expect(new Set(demoSecurityCameras.map(({ assetCode }) => assetCode)).size).toBe(10);
    for (const camera of demoSecurityCameras) {
      expect(camera.yaw).toBeGreaterThanOrEqual(-180);
      expect(camera.yaw).toBeLessThanOrEqual(180);
      expect(camera.pitch).toBeGreaterThanOrEqual(-90);
      expect(camera.pitch).toBeLessThanOrEqual(90);
    }
  });

  it('define como fija únicamente la cámara del Pasillo', () => {
    const fixedCameras = demoSecurityCameras.filter(({ type }) => type === 'Fija');
    expect(fixedCameras).toHaveLength(1);
    expect(fixedCameras[0]?.panoramaId).toBe('pasillo-01');
    expect(demoSecurityCameras.filter(({ type }) => type === '360°')).toHaveLength(9);
  });
});
