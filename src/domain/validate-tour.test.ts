import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { demoTour } from '../data/demo-tour';
import {
  findUnreachablePanoramaIds,
  getPanoramaLocation,
  listPanoramas,
  validateTour,
} from './validate-tour';

describe('recorrido de cuatro grupos especiales', () => {
  it('acepta los diez panoramas conectados y bidireccionales', () => {
    expect(demoTour.floors).toHaveLength(4);
    expect(listPanoramas(demoTour)).toHaveLength(10);
    expect(validateTour(demoTour)).toEqual([]);
    expect(findUnreachablePanoramaIds(demoTour)).toEqual([]);
  });

  it('comprueba que cada imagen configurada exista en public', () => {
    for (const panorama of listPanoramas(demoTour)) {
      expect(existsSync(resolve('public', panorama.image)), panorama.image).toBe(true);
    }
  });

  it('encuentra la ubicación del estudio en el segundo piso', () => {
    expect(getPanoramaLocation(demoTour, 'estudio-01')).toMatchObject({
      floorId: 'segundo-piso',
      roomId: 'estudio',
      panoramaId: 'estudio-01',
    });
  });

  it ('ubica el sotano y el jardin en sus grupos correspondientes', () => {
    expect(getPanoramaLocation(demoTour, 'sotano-01')).toMatchObject({
      floorId: 'sotano',
      roomId: 'sotano',
      panoramaId: 'sotano-01',
    });

    expect(getPanoramaLocation(demoTour, 'jardin-01')).toMatchObject({
      floorId: 'exterior',
      roomId: 'jardin',
      panoramaId: 'jardin-01',
    });
  });

  it('mantiene dos ramas habitables desde la escalera superior', () => {
    const upper = listPanoramas(demoTour).find(({ id }) => id === 'escalera-superior-01');
    expect(upper?.links.map(({ targetId }) => targetId)).toEqual([
      'escalera-inferior-01',
      'cuarto-derecho-01',
      'cuarto-izquierdo-01',
    ]);
  });

  it('rechaza una entrada que no pertenece al ambiente', () => {
  const copy = structuredClone(demoTour);
  const parking = copy.floors
    .flatMap(({ rooms }) => rooms)
    .find(({ id }) => id === 'parqueadero');

  if (!parking) {
    throw new Error('No se encontró el parqueadero de prueba.');
  }

  parking.entryPanoramaId = 'cocina-01';

  expect(validateTour(copy)).toContain(
    'El panorama de entrada de "parqueadero" no pertenece al ambiente.',
  );
});

  it('detecta un sector aislado aunque sus enlaces internos tengan regreso', () => {
    const copy = structuredClone(demoTour);
    const lower = listPanoramas(copy).find(({ id }) => id === 'escalera-inferior-01');
    const upper = listPanoramas(copy).find(({ id }) => id === 'escalera-superior-01');
    if (!lower || !upper) throw new Error('No se encontraron las escaleras de prueba.');
    lower.links = lower.links.filter(({ targetId }) => targetId !== upper.id);
    upper.links = upper.links.filter(({ targetId }) => targetId !== lower.id);
    expect(findUnreachablePanoramaIds(copy)).toEqual([
      'escalera-superior-01',
      'cuarto-derecho-01',
      'cuarto-izquierdo-01',
      'estudio-01',
    ]);
  });
});
