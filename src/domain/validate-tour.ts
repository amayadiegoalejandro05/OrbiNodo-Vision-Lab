import type { PanoramaLocation, TourConfig, TourPanorama } from './tour.types';

export function listPanoramas(tour: TourConfig): TourPanorama[] {
  return tour.floors.flatMap((floor) =>
    floor.rooms.flatMap((room) => room.panoramas),
  );
}

export function getPanoramaLocation(
  tour: TourConfig,
  panoramaId: string,
): PanoramaLocation | undefined {
  for (const floor of tour.floors) {
    for (const room of floor.rooms) {
      const panorama = room.panoramas.find(({ id }) => id === panoramaId);
      if (panorama) {
        return {
          floorId: floor.id,
          floorName: floor.name,
          roomId: room.id,
          roomName: room.name,
          panoramaId: panorama.id,
          panoramaName: panorama.name,
        };
      }
    }
  }
  return undefined;
}

export function findUnreachablePanoramaIds(tour: TourConfig): string[] {
  const panoramas = listPanoramas(tour);
  const byId = new Map(panoramas.map((panorama) => [panorama.id, panorama]));
  const visited = new Set<string>();
  const pending = byId.has(tour.startPanoramaId) ? [tour.startPanoramaId] : [];

  while (pending.length > 0) {
    const currentId = pending.shift();
    if (!currentId || visited.has(currentId)) continue;
    visited.add(currentId);
    const current = byId.get(currentId);
    for (const link of current?.links ?? []) {
      if (byId.has(link.targetId) && !visited.has(link.targetId)) {
        pending.push(link.targetId);
      }
    }
  }

  return panoramas
    .map(({ id }) => id)
    .filter((id) => !visited.has(id));
}

// Devuelve todos los problemas juntos para corregir la configuración de una vez.
export function validateTour(tour: TourConfig): string[] {
  const errors: string[] = [];
  const panoramas = listPanoramas(tour);
  const panoramaIds = new Set<string>();
  const floorIds = new Set<string>();
  const roomIds = new Set<string>();

  if (tour.floors.length === 0) {
    errors.push('El recorrido debe contener al menos un piso.');
  }

  for (const floor of tour.floors) {
    if (floorIds.has(floor.id)) errors.push(`El piso "${floor.id}" está duplicado.`);
    floorIds.add(floor.id);
    if (floor.rooms.length === 0) errors.push(`El piso "${floor.id}" no contiene ambientes.`);

    for (const room of floor.rooms) {
      if (roomIds.has(room.id)) errors.push(`El ambiente "${room.id}" está duplicado.`);
      roomIds.add(room.id);
      if (room.panoramas.length === 0) {
        errors.push(`El ambiente "${room.id}" debe contener al menos un panorama.`);
      }
      if (!room.panoramas.some(({ id }) => id === room.entryPanoramaId)) {
        errors.push(`El panorama de entrada de "${room.id}" no pertenece al ambiente.`);
      }
    }
  }

  for (const panorama of panoramas) {
    if (panoramaIds.has(panorama.id)) {
      errors.push(`El panorama "${panorama.id}" está duplicado.`);
    }
    panoramaIds.add(panorama.id);
    if (!panorama.image || panorama.image.includes('..') || /^https?:/i.test(panorama.image)) {
      errors.push(`El panorama "${panorama.id}" debe usar una ruta local segura.`);
    }
  }

  if (!panoramaIds.has(tour.startPanoramaId)) {
    errors.push('El panorama inicial no existe.');
  }

  for (const panorama of panoramas) {
    for (const link of panorama.links) {
      if (!panoramaIds.has(link.targetId)) {
        errors.push(`El enlace ${panorama.id} -> ${link.targetId} no tiene destino válido.`);
      }
      if (link.targetId === panorama.id) {
        errors.push(`El panorama "${panorama.id}" no debe enlazarse consigo mismo.`);
      }
      if (link.yaw < -180 || link.yaw > 180 || link.pitch < -90 || link.pitch > 90) {
        errors.push(`El enlace ${panorama.id} -> ${link.targetId} tiene ángulos fuera de rango.`);
      }
      const destination = panoramas.find(({ id }) => id === link.targetId);
      if (destination && !destination.links.some(({ targetId }) => targetId === panorama.id)) {
        errors.push(`Falta el enlace de regreso ${link.targetId} -> ${panorama.id}.`);
      }
    }
  }

  for (const panoramaId of findUnreachablePanoramaIds(tour)) {
    errors.push(`El panorama "${panoramaId}" no es alcanzable desde el inicio.`);
  }

  return errors;
}

export function assertValidTour(tour: TourConfig): void {
  const errors = validateTour(tour);
  if (errors.length > 0) {
    throw new Error('Configuración de recorrido inválida:\n- ' + errors.join('\n- '));
  }
}
