import type { TourConfig } from '../domain/tour.types';
import type { SecurityCameraRecord } from '../domain/security-camera.types';
import { getPanoramaLocation } from '../domain/validate-tour';

export interface CameraMapApi {
  element: HTMLElement;
  refresh: (cameras: SecurityCameraRecord[]) => void;
  setActivePanorama: (panoramaId: string) => void;
  destroy: () => void;
}

function statusClass(status: SecurityCameraRecord['status']): string {
  if (status === 'Operativa') return 'is-operational';
  if (status === 'En mantenimiento') return 'is-maintenance';
  return 'is-offline';
}

// Es un mapa lógico de activos, no un plano arquitectónico. Agrupa las cámaras
// por nivel y permite saltar a su panorama y abrir directamente su ficha.
export function createCameraMap(
  parent: HTMLElement,
  tour: TourConfig,
  initialCameras: SecurityCameraRecord[],
  onNavigate: (cameraId: string) => void,
): CameraMapApi {
  const section = document.createElement('section');
  section.className = 'camera-map';
  section.setAttribute('aria-labelledby', 'camera-map-title');
  parent.append(section);
  let activePanoramaId = tour.startPanoramaId;
  let cameras = initialCameras;

  function render(): void {
    const grouped = new Map<string, SecurityCameraRecord[]>();
    for (const camera of cameras) {
      const floorName = getPanoramaLocation(tour, camera.panoramaId)?.floorName ?? 'Sin grupo';
      grouped.set(floorName, [...(grouped.get(floorName) ?? []), camera]);
    }
    section.innerHTML = `
      <div class="camera-map-heading">
        <h3 id="camera-map-title">Mapa de cámaras</h3>
        <span>${cameras.length} equipos</span>
      </div>
      <p>Selecciona una cámara para ir a su espacio y abrir la ficha.</p>`;
    for (const [floorName, floorCameras] of grouped) {
      const group = document.createElement('div');
      group.className = 'camera-map-group';
      const title = document.createElement('h4');
      title.textContent = floorName;
      const lane = document.createElement('div');
      lane.className = 'camera-map-lane';
      for (const camera of floorCameras) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'camera-map-node ' + statusClass(camera.status);
        button.dataset.cameraId = camera.id;
        button.dataset.panoramaId = camera.panoramaId;
        button.classList.toggle('is-current-space', camera.panoramaId === activePanoramaId);
        button.setAttribute('aria-label', 'Abrir ' + camera.name + ', ' + camera.status);
        button.title = camera.location + ' · ' + camera.status;
        const dot = document.createElement('span');
        dot.className = 'camera-map-dot';
        dot.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.textContent = camera.assetCode;
        button.append(dot, label);
        button.addEventListener('click', () => onNavigate(camera.id));
        lane.append(button);
      }
      group.append(title, lane);
      section.append(group);
    }
  }

  render();
  return {
    element: section,
    refresh: (updatedCameras) => { cameras = updatedCameras; render(); },
    setActivePanorama: (panoramaId) => { activePanoramaId = panoramaId; render(); },
    destroy: () => section.remove(),
  };
}
