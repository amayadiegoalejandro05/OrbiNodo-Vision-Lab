// Los estilos se separan por responsabilidad para localizar cada función con rapidez.
import './styles/main.css';
import './styles/auth.css';
import './styles/experience.css';
import './styles/calibration.css';
import './styles/minimap.css';
import './styles/operational-tools.css';
import { getCamerasFromApi, updateCameraOperations } from './api/camera-api';
import {
  endApiSession, getActiveApiSession, type DemoSession,
} from './auth/demo-auth';
import { createLoginView } from './auth/login-view';
import { getRolePermissions } from './auth/role-permissions';
import { demoTour } from './data/demo-tour';
import type { PanoramaLocation } from './domain/tour.types';
import type { SecurityCameraRecord } from './domain/security-camera.types';
import { recordSuccessfulLogin, recordSuccessfulLogout } from './persistence/demo-operations-store';
import { createCameraMap, type CameraMapApi } from './ui/camera-map';
import { createCoordinateCalibrator } from './ui/coordinate-calibrator';
import { createLocationMenu, type LocationMenuApi } from './ui/location-menu';
import { createManagerAuditView } from './ui/manager-audit-view';
import { createTourMinimap, type TourMinimapApi } from './ui/tour-minimap';
import type { PanoramaViewerApi, PanoramaViewerStatus } from './viewer/panorama-viewer';

function required<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error('No se encontró el elemento obligatorio: ' + selector);
  return element;
}

const loginScreen = required<HTMLElement>('#login-screen');
const app = required<HTMLDivElement>('#app');
const container = required<HTMLDivElement>('#panorama-viewer');
const menuContainer = required<HTMLElement>('#location-menu');
const minimapContainer = required<HTMLElement>('#tour-minimap');
const mapsDashboard = required<HTMLElement>('#maps-dashboard');
const managerControlHost = required<HTMLElement>('#manager-control-host');
const homeButton = required<HTMLButtonElement>('#go-home');
const logoutButton = required<HTMLButtonElement>('#logout-button');
const menuButton = required<HTMLButtonElement>('#toggle-locations');
const statusElement = required<HTMLParagraphElement>('#app-status');
const locationElement = required<HTMLParagraphElement>('#current-location');
const progressElement = required<HTMLParagraphElement>('#tour-progress');
const retryButton = required<HTMLButtonElement>('#retry-panorama');
const calibrator = createCoordinateCalibrator(app);
const managerAudit = createManagerAuditView(managerControlHost);
const profileElement = document.createElement('p');
profileElement.className = 'current-profile';
profileElement.setAttribute('aria-live', 'polite');
progressElement.after(profileElement);
const roomEntries = demoTour.floors.flatMap((floor) =>
  floor.rooms.map((room) => ({ id: room.entryPanoramaId, panoramaIds: room.panoramas.map((item) => item.id) })),
);

let panoramaViewer: PanoramaViewerApi | undefined;
let locationMenu: LocationMenuApi | undefined;
let tourMinimap: TourMinimapApi | undefined;
let cameraMap: CameraMapApi | undefined;
let cameraRecords: SecurityCameraRecord[] = [];
let mountVersion = 0;

function renderStatus(status: PanoramaViewerStatus): void {
  statusElement.dataset.state = status.kind;
  statusElement.textContent = status.message;
  retryButton.hidden = status.kind !== 'error';
  container.setAttribute('aria-busy', String(status.kind === 'loading'));
}

function closeMobileMenu(): void {
  app.classList.remove('is-menu-open');
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.textContent = 'Mostrar ubicaciones';
}

async function navigateTo(panoramaId: string): Promise<void> {
  if (!panoramaViewer) return;
  closeMobileMenu();
  try { await panoramaViewer.goTo(panoramaId); }
  catch (error) {
    console.error('No fue posible abrir la ubicación solicitada:', error);
    renderStatus({ kind: 'error', message: 'La ubicación solicitada no está disponible.' });
  }
}

async function navigateToCamera(cameraId: string): Promise<void> {
  if (!panoramaViewer) return;
  closeMobileMenu();
  try { await panoramaViewer.goToCamera(cameraId); }
  catch (error) {
    console.error('No fue posible abrir la cámara solicitada:', error);
    renderStatus({ kind: 'error', message: 'La cámara solicitada no está disponible.' });
  }
}

function renderLocation(location: PanoramaLocation): void {
  locationElement.textContent = location.floorName + ' · ' + location.roomName + ' · ' + location.panoramaName;
  container.setAttribute('aria-label', 'Panorama 360° de ' + location.roomName);
  locationMenu?.setActivePanorama(location.panoramaId);
  tourMinimap?.setActivePanorama(location.panoramaId);
  cameraMap?.setActivePanorama(location.panoramaId);
  calibrator.setPanorama(location.panoramaId);
  homeButton.classList.toggle('is-at-home', location.panoramaId === demoTour.startPanoramaId);
  const index = roomEntries.findIndex((room) => room.panoramaIds.includes(location.panoramaId));
  progressElement.textContent = 'Ubicación ' + (index + 1) + ' de ' + roomEntries.length;
}

async function mountTour(session: DemoSession): Promise<void> {
  if (panoramaViewer) return;
  const currentMount = ++mountVersion;
  const permissions = getRolePermissions(session.role);
  calibrator.setAvailable(permissions.calibrator);
  managerAudit.setAvailable(permissions.viewAuditHistory);
  profileElement.textContent = 'Perfil: ' + session.displayName;
  app.dataset.role = session.role;
  loginView.hide();
  app.hidden = false;
  renderStatus({ kind: 'loading', message: 'Consultando cámaras en PostgreSQL…' });
  try {
    cameraRecords = await getCamerasFromApi();
  } catch (error) {
    renderStatus({
      kind: 'error',
      message: error instanceof Error ? error.message : 'La API local no está disponible.',
    });
    return;
  }
  if (currentMount !== mountVersion || app.hidden) return;
  renderStatus({ kind: 'loading', message: 'Descargando el visor 360°…' });
  const { createPanoramaViewer } = await import('./viewer/panorama-viewer');
  if (currentMount !== mountVersion || app.hidden) return;
  menuContainer.replaceChildren();
  minimapContainer.replaceChildren();
  locationMenu = createLocationMenu(menuContainer, demoTour, (id) => void navigateTo(id));
  tourMinimap = createTourMinimap(minimapContainer, demoTour, (id) => void navigateTo(id));
  if (permissions.cameraMap) {
    cameraMap = createCameraMap(mapsDashboard, demoTour, cameraRecords, (id) => void navigateToCamera(id));
  }
  panoramaViewer = createPanoramaViewer(
    container,
    demoTour,
    renderStatus,
    renderLocation,
    (position) => calibrator.update(position),
    {
      session,
      cameras: cameraRecords,
      saveCameraOperations: updateCameraOperations,
      onCameraUpdated: (updated) => {
        cameraRecords = cameraRecords.map((camera) =>
          camera.id === updated.id ? updated : camera,
        );
        cameraMap?.refresh(cameraRecords);
      },
    },
  );
  app.dataset.ready = 'true';
}

function unmountTour(): void {
  mountVersion += 1;
  locationMenu?.destroy();
  tourMinimap?.destroy();
  cameraMap?.destroy();
  panoramaViewer?.destroy();
  locationMenu = undefined;
  tourMinimap = undefined;
  cameraMap = undefined;
  panoramaViewer = undefined;
  menuContainer.replaceChildren();
  minimapContainer.replaceChildren();
  container.replaceChildren();
  calibrator.setAvailable(false);
  managerAudit.setAvailable(false);
  profileElement.textContent = '';
  delete app.dataset.ready;
  delete app.dataset.role;
  closeMobileMenu();
  app.hidden = true;
}

let refreshingCameras = false;
async function refreshCamerasFromApi(): Promise<void> {
  if (!panoramaViewer || refreshingCameras) return;
  refreshingCameras = true;
  try {
    cameraRecords = await getCamerasFromApi();
    cameraMap?.refresh(cameraRecords);
    panoramaViewer.refreshCameras(cameraRecords);
  } catch (error) {
    renderStatus({
      kind: 'error',
      message: error instanceof Error ? error.message : 'La API local no está disponible.',
    });
  } finally {
    refreshingCameras = false;
  }
}

const loginView = createLoginView(loginScreen, (session) => {
  recordSuccessfulLogin(session);
  void mountTour(session);
});
homeButton.addEventListener('click', () => void navigateTo(demoTour.startPanoramaId));
retryButton.addEventListener('click', () => void panoramaViewer?.retry());
menuButton.addEventListener('click', () => {
  const willOpen = !app.classList.contains('is-menu-open');
  app.classList.toggle('is-menu-open', willOpen);
  menuButton.setAttribute('aria-expanded', String(willOpen));
  menuButton.textContent = willOpen ? 'Ocultar ubicaciones' : 'Mostrar ubicaciones';
});
logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true;
  try {
    await endApiSession();
    recordSuccessfulLogout();
    unmountTour();
    loginView.show();
  } catch {
    renderStatus({
      kind: 'error', message: 'No fue posible cerrar la sesión en la API local.',
    });
  } finally {
    logoutButton.disabled = false;
  }
});

async function restoreSession(): Promise<void> {
  try {
    const session = await getActiveApiSession();
    if (session) await mountTour(session);
    else loginView.show();
  } catch {
    loginView.show();
  }
}

void restoreSession();
window.addEventListener('focus', () => void refreshCamerasFromApi());
window.addEventListener('beforeunload', unmountTour, { once: true });
