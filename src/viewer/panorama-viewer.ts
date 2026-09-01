// El núcleo dibuja imágenes; los complementos agregan navegación y puntos CCTV.
import { Viewer } from '@photo-sphere-viewer/core';
import '@photo-sphere-viewer/core/index.css';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
import '@photo-sphere-viewer/markers-plugin/index.css';
import { VirtualTourPlugin, type VirtualTourNode } from '@photo-sphere-viewer/virtual-tour-plugin';
import '@photo-sphere-viewer/virtual-tour-plugin/index.css';
import '../styles/security-cameras.css';
import type { DemoSession } from '../auth/demo-auth';
import { getRolePermissions } from '../auth/role-permissions';
import type { PanoramaLocation, TourConfig } from '../domain/tour.types';
import type {
  CameraOperationalUpdate, CameraUpdateResult, SecurityCameraRecord,
} from '../domain/security-camera.types';
import { assertValidTour, getPanoramaLocation, listPanoramas } from '../domain/validate-tour';
import { buildSecurityCameraMarker } from './security-camera-markers';

export type PanoramaViewerStatus =
  | { kind: 'loading'; message: string }
  | { kind: 'ready'; message: string }
  | { kind: 'error'; message: string };

export interface PanoramaViewerPosition {
  yaw: number;
  pitch: number;
}

export interface PanoramaViewerApi {
  retry: () => Promise<void>;
  goTo: (panoramaId: string) => Promise<void>;
  goToCamera: (cameraId: string) => Promise<void>;
  refreshCameras: (cameras: SecurityCameraRecord[]) => void;
  destroy: () => void;
}

export interface PanoramaViewerOptions {
  session: DemoSession;
  cameras: SecurityCameraRecord[];
  saveCameraOperations: (
    cameraId: string, update: CameraOperationalUpdate,
    expectedVersion: number,
  ) => Promise<CameraUpdateResult>;
  onCameraUpdated?: (camera: SecurityCameraRecord) => void;
}

function buildNodes(
  tour: TourConfig,
  camerasByPanorama: Map<string, SecurityCameraRecord>,
  editable: boolean,
): VirtualTourNode[] {
  return listPanoramas(tour).map((panorama) => {
    const camera = camerasByPanorama.get(panorama.id);
    return {
      id: panorama.id,
      name: panorama.name,
      panorama: import.meta.env.BASE_URL + panorama.image,
      caption: getPanoramaLocation(tour, panorama.id)?.roomName,
      links: panorama.links.map((link) => ({
        nodeId: link.targetId,
        position: { yaw: link.yaw + 'deg', pitch: link.pitch + 'deg' },
      })),
      markers: camera ? [buildSecurityCameraMarker(camera, { editable })] : [],
    };
  });
}

function shortestYawDistance(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function readRequiredFormValue(formData: FormData, name: string): string {
  const value = formData.get(name);
  if (typeof value !== 'string') throw new Error('Falta completar ' + name + '.');
  return value;
}

export function createPanoramaViewer(
  container: HTMLElement,
  tour: TourConfig,
  onStatus: (status: PanoramaViewerStatus) => void,
  onLocation: (location: PanoramaLocation) => void,
  onPosition: ((position: PanoramaViewerPosition) => void) | undefined,
  options: PanoramaViewerOptions,
): PanoramaViewerApi {
  assertValidTour(tour);
  const permissions = getRolePermissions(options.session.role);
  const cameraRecordsById = new Map(options.cameras.map((camera) => [camera.id, camera]));
  const camerasByPanorama = new Map([...cameraRecordsById.values()].map((camera) => [camera.panoramaId, camera]));
  const panoramasById = new Map(listPanoramas(tour).map((panorama) => [panorama.id, panorama]));
  onStatus({ kind: 'loading', message: 'Cargando el recorrido de demostración…' });
  const viewer = new Viewer({
    container,
    navbar: ['zoom', 'move', 'caption', 'fullscreen'],
    defaultZoomLvl: 45,
    minFov: 30,
    maxFov: 90,
    mousewheel: true,
    mousemove: true,
    keyboard: 'fullscreen',
    lang: {
      loading: 'Cargando panorama…',
      loadError: 'No fue posible cargar el panorama.',
      webglError: 'Este dispositivo no permite iniciar WebGL.',
    },
    plugins: [
      MarkersPlugin.withConfig({
        defaultHoverScale: { amount: 1.15, duration: 120, easing: 'ease-out' },
      }),
      VirtualTourPlugin.withConfig({
        dataMode: 'client',
        positionMode: 'manual',
        renderMode: '3d',
        startNodeId: tour.startPanoramaId,
        nodes: buildNodes(tour, camerasByPanorama, permissions.editCameraOperations),
        preload: true,
        transitionOptions: { effect: 'fade', rotation: true },
      }),
    ],
  });
  const markers = viewer.getPlugin<MarkersPlugin>(MarkersPlugin);
  const virtualTour = viewer.getPlugin<VirtualTourPlugin>(VirtualTourPlugin);
  if (!markers || !virtualTour) throw new Error('No fue posible iniciar los complementos del recorrido.');

  function updateFloorArrowVisibility(): void {
    const currentId = virtualTour.getCurrentNode()?.id;
    const panorama = currentId ? panoramasById.get(currentId) : undefined;
    if (!panorama) return;
    const currentYaw = viewer.getPosition().yaw;
    const halfHorizontalFov = viewer.state.hFov * Math.PI / 360;
    const arrows = container.querySelectorAll<HTMLElement>('.psv-virtual-tour-link');
    arrows.forEach((arrow, index) => {
      const link = panorama.links[index];
      const linkYaw = link ? link.yaw * Math.PI / 180 : Number.POSITIVE_INFINITY;
      const isInsideView = Math.abs(shortestYawDistance(currentYaw, linkYaw)) <= halfHorizontalFov;
      arrow.style.visibility = isInsideView ? '' : 'hidden';
      arrow.style.pointerEvents = isInsideView ? 'auto' : 'none';
      arrow.dataset.inView = String(isInsideView);
      if (isInsideView) arrow.removeAttribute('aria-hidden');
      else arrow.setAttribute('aria-hidden', 'true');
    });
  }

  function refreshCurrentCameraMarker(panoramaId: string): void {
    const camera = camerasByPanorama.get(panoramaId);
    if (!camera) return;
    markers.updateMarker(buildSecurityCameraMarker(camera, { editable: permissions.editCameraOperations }));
  }

  function refreshCameras(cameras: SecurityCameraRecord[]): void {
    cameraRecordsById.clear();
    camerasByPanorama.clear();
    for (const camera of cameras) {
      cameraRecordsById.set(camera.id, camera);
      camerasByPanorama.set(camera.panoramaId, camera);
    }
    const currentId = virtualTour.getCurrentNode()?.id;
    if (currentId) refreshCurrentCameraMarker(currentId);
  }

  async function handleCameraEdit(event: SubmitEvent): Promise<void> {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches('[data-camera-edit-form]')) return;
    event.preventDefault();
    const statusElement = form.querySelector<HTMLElement>('.camera-edit-status');
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const formData = new FormData(form);
      const update: CameraOperationalUpdate = {
        status: readRequiredFormValue(formData, 'status') as CameraOperationalUpdate['status'],
        lastMaintenanceOn: readRequiredFormValue(formData, 'lastMaintenanceOn'),
        nextMaintenanceOn: readRequiredFormValue(formData, 'nextMaintenanceOn'),
        responsibleArea: readRequiredFormValue(formData, 'responsibleArea'),
        notes: readRequiredFormValue(formData, 'notes'),
      };
      const cameraId = form.dataset.cameraId ?? '';
      const currentCamera = cameraRecordsById.get(cameraId);
      const result = await options.saveCameraOperations(
        cameraId, update, currentCamera?.version ?? 0,
      );
      cameraRecordsById.set(result.camera.id, result.camera);
      camerasByPanorama.set(result.camera.panoramaId, result.camera);
      markers.updateMarker(buildSecurityCameraMarker(result.camera, { editable: true }));
      markers.showMarkerPanel(result.camera.id);
      const refreshedStatus = container.querySelector<HTMLElement>('.camera-edit-status');
      if (refreshedStatus) refreshedStatus.textContent = result.changedFields.length > 0
        ? 'Cambios guardados y añadidos al historial del Jefe.'
        : 'No había cambios nuevos para guardar.';
      options.onCameraUpdated?.(result.camera);
    } catch (error) {
      if (statusElement) {
        statusElement.dataset.state = 'error';
        statusElement.textContent = error instanceof Error ? error.message : 'No fue posible guardar los cambios.';
      }
    } finally {
      if (submit?.isConnected) submit.disabled = false;
    }
  }
  container.addEventListener('submit', handleCameraEdit);

  viewer.addEventListener('load-progress', ({ progress }) => {
    onStatus({ kind: 'loading', message: 'Cargando panorama… ' + Math.round(progress) + ' %' });
  });
  viewer.addEventListener('position-updated', ({ position }) => {
    onPosition?.(position);
    updateFloorArrowVisibility();
  });
  viewer.addEventListener('zoom-updated', updateFloorArrowVisibility);
  virtualTour.addEventListener('node-changed', ({ node }) => {
    const location = getPanoramaLocation(tour, node.id);
    if (location) onLocation(location);
    // Reaplica el valor almacenado más reciente al regresar a una cámara editada.
    refreshCurrentCameraMarker(node.id);
    updateFloorArrowVisibility();
    onStatus({ kind: 'ready', message: 'Vista lista. Gira para encontrar flechas y puntos CCTV.' });
  });
  viewer.addEventListener('panorama-error', ({ error }) => {
    console.error('Error al cargar el panorama:', error);
    onStatus({ kind: 'error', message: 'No fue posible cargar esta vista. Puedes intentar nuevamente.' });
  });

  async function goTo(panoramaId: string, forceUpdate = false): Promise<void> {
    onStatus({ kind: 'loading', message: 'Cambiando de ambiente…' });
    await virtualTour.setCurrentNode(panoramaId, { forceUpdate });
  }

  async function goToCamera(cameraId: string): Promise<void> {
    const camera = cameraRecordsById.get(cameraId);
    if (!camera) throw new Error('La cámara solicitada no existe.');
    await goTo(camera.panoramaId);
    await markers.gotoMarker(camera.id, '10rpm');
    markers.showMarkerPanel(camera.id);
  }

  return {
    goTo,
    goToCamera,
    refreshCameras,
    retry: async () => {
      const currentId = virtualTour.getCurrentNode()?.id ?? tour.startPanoramaId;
      try { await goTo(currentId, true); }
      catch (error) {
        console.error('El reintento falló:', error);
        onStatus({ kind: 'error', message: 'El panorama continúa sin estar disponible.' });
      }
    },
    destroy: () => {
      container.removeEventListener('submit', handleCameraEdit);
      viewer.destroy();
    },
  };
}
