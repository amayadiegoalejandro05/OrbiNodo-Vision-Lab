/* global console, process, document, getComputedStyle, setTimeout */
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

async function freePort() {
  const socket = createNetServer();
  await new Promise((ok) => socket.listen(0, '127.0.0.1', ok));
  const address = socket.address();
  if (!address || typeof address === 'string') throw new Error('No hay puerto libre.');
  await new Promise((ok) => socket.close(ok));
  return address.port;
}

loadDotenv({ path: resolve('.env.backend.local'), quiet: true });
const programmer = {
  username: 'Orbinodo', password: process.env.ORBINODO_SEED_PROGRAMMER_PASSWORD,
};
const manager = {
  username: 'Jefe', password: process.env.ORBINODO_SEED_MANAGER_PASSWORD,
};
const engineer1 = {
  username: 'Ingeniero 1', password: process.env.ORBINODO_SEED_ENGINEER1_PASSWORD,
};
const engineer2 = {
  username: 'Ingeniero 2', password: process.env.ORBINODO_SEED_ENGINEER2_PASSWORD,
};
if ([programmer, manager, engineer1, engineer2].some(({ password }) => !password)) {
  throw new Error('Faltan credenciales locales para verificar el frontend.');
}

const apiPort = await freePort();
const apiUrl = `http://127.0.0.1:${apiPort}`;
process.env.ORBINODO_API_TARGET = apiUrl;
const api = spawn(process.execPath, [
  resolve('node_modules/tsx/dist/cli.mjs'), resolve('backend/server.ts'),
], {
  env: { ...process.env, ORBINODO_API_PORT: String(apiPort) }, stdio: 'ignore',
});

async function waitForApi() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${apiUrl}/api/health`);
      if (response.ok) return;
    } catch { /* Fastify todavía está iniciando */ }
    await new Promise((ok) => setTimeout(ok, 100));
  }
  throw new Error('La API temporal no inició correctamente.');
}

await waitForApi();

const server = await createServer({ server: { host: '127.0.0.1', port: 4176, strictPort: true } });
await server.listen();
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
  args: ['--enable-webgl', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const errors = [];
const requests = [];
page.on('request', (request) => requests.push(request.url()));
page.on('pageerror', (error) => errors.push(error.message));
page.on('requestfailed', (request) => errors.push(request.url() + ': ' + request.failure()?.errorText));
function assert(condition, message) { if (!condition) throw new Error(message); }

async function login(account, expectedRole) {
  await page.locator('#demo-username').fill(account.username);
  await page.locator('#demo-password').fill(account.password);
  await page.getByRole('button', { name: 'Entrar a Orbinodo' }).click();
  await page.waitForSelector('.psv-container');
  await page.waitForFunction(() => document.querySelector('#current-location')?.textContent?.includes('Parqueadero'));
  assert(await page.locator('#app').getAttribute('data-role') === expectedRole, 'No se aplicó el rol ' + expectedRole + '.');
}

async function logout() {
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.waitForSelector('#login-screen:not([hidden])');
  assert(await page.locator('#login-screen').isVisible(), 'Cerrar sesión no mostró el formulario.');
}

async function openCameraFromMap(cameraId) {
  await page.locator(`.camera-map-node[data-camera-id="${cameraId}"]`).click();
  await page.waitForSelector('.camera-information');
}

async function closeViewerPanel() {
  const close = page.locator('.psv-panel-close-button');
  if (await close.isVisible()) await close.click();
}

async function assertCleanEncoding() {
  const text = await page.locator('body').innerText();
  assert(!/[ÃÂ]/.test(text) && !text.includes('â€¦') && !text.includes('â†’'), 'La interfaz todavía contiene texto con codificación dañada.');
}

try {
  await page.goto('http://127.0.0.1:4176/', { waitUntil: 'domcontentloaded' });
  assert(await page.locator('#login-screen').isVisible(), 'No apareció el formulario.');
  assert(!requests.some((url) => url.includes('/viewer/panorama-viewer')), 'El visor se descargó antes del acceso.');

  // ORBINODO: calibración, mapas bajo el recorrido y fichas de solo lectura.
  await login(programmer, 'programmer');
  assert(requests.some((url) => url.includes('/viewer/panorama-viewer')), 'El visor diferido no se descargó.');
  assert(await page.locator('.calibration-toolbar').isVisible(), 'Orbinodo no ve el calibrador.');
  assert(await page.locator('.camera-map-node').count() === 10, 'El mapa no contiene diez cámaras.');
  assert(await page.locator('.manager-audit-tools').isHidden(), 'Orbinodo ve historiales reservados al Jefe.');
  assert((await page.locator('.current-profile').textContent())?.includes('Orbinodo'), 'No se mostró el perfil Orbinodo.');
  assert(await page.locator('.minimap-node').count() === 10, 'El minimapa no contiene diez nodos.');
  const mapLayout = await page.evaluate(() => {
    const panorama = document.querySelector('#panorama-viewer')?.getBoundingClientRect();
    const nodes = document.querySelector('.tour-minimap')?.getBoundingClientRect();
    const cameras = document.querySelector('.camera-map')?.getBoundingClientRect();
    const sidebar = document.querySelector('.locations');
    return {
      mapsBelow: Boolean(panorama && nodes && cameras && nodes.top > panorama.bottom && cameras.top > panorama.bottom),
      mapsInDashboard: Boolean(document.querySelector('#maps-dashboard > .tour-minimap') && document.querySelector('#maps-dashboard > .camera-map')),
      sidebarOverflow: sidebar ? getComputedStyle(sidebar).overflowY : '',
      sidebarPosition: sidebar ? getComputedStyle(sidebar).position : '',
    };
  });
  assert(mapLayout.mapsBelow && mapLayout.mapsInDashboard, 'Los dos mapas no quedaron debajo del recorrido.');
  assert(mapLayout.sidebarOverflow === 'auto' && mapLayout.sidebarPosition === 'sticky', 'La barra lateral no tiene desplazamiento independiente.');
  await page.waitForFunction(() => [...document.querySelectorAll('.psv-virtual-tour-link')].every((arrow) => arrow.dataset.inView));
  const arrowsInsideView = await page.locator('.psv-virtual-tour-link[data-in-view=true]').count();
  assert(arrowsInsideView === 1, 'El filtro direccional de flechas no funcionó.');
  const visibleFloorArrow = page.locator('.psv-virtual-tour-link[data-in-view=true]');
  assert(await visibleFloorArrow.evaluate((arrow) => getComputedStyle(arrow).pointerEvents) === 'auto', 'La flecha visible no acepta clics.');
  await visibleFloorArrow.click();
  await page.waitForFunction(() => document.querySelector('#current-location')?.textContent?.includes('Pasillo'));
  await page.waitForSelector('.security-camera-hotspot.psv-marker--visible .security-camera-marker');
  await page.getByRole('button', { name: 'Abrir ficha de Cámara 3 - Pasillo' }).click();
  await page.waitForSelector('.camera-information');
  assert(await page.locator('.camera-edit-form').count() === 0, 'Orbinodo recibió edición operativa.');
  await closeViewerPanel();
  await assertCleanEncoding();
  await logout();

  // INGENIERO 1: cambia estado, mantenimiento, responsable y observaciones.
  await login(engineer1, 'engineer1');
  assert(await page.locator('.calibration-toolbar').isHidden(), 'Ingeniero 1 ve el calibrador.');
  assert(await page.locator('.manager-audit-tools').isHidden(), 'Ingeniero 1 ve historiales del Jefe.');
  await openCameraFromMap('camera-03');
  const form1 = page.locator('.camera-edit-form');
  assert(await form1.isVisible(), 'Ingeniero 1 no recibió el editor.');
  await form1.locator('[name="status"]').selectOption('En mantenimiento');
  await form1.locator('[name="lastMaintenanceOn"]').fill('2026-08-10');
  await form1.locator('[name="nextMaintenanceOn"]').fill('2026-11-10');
  await form1.locator('[name="responsibleArea"]').fill('Mantenimiento CCTV');
  await form1.locator('[name="notes"]').fill('Ingeniero 1 programó revisión del soporte y limpieza del lente.');
  await form1.getByRole('button', { name: 'Guardar cambios operativos' }).click();
  await page.waitForFunction(() => document.querySelector('.camera-edit-status')?.textContent?.includes('historial'));
  await closeViewerPanel();
  assert((await page.locator('.camera-map-node[data-camera-id="camera-03"]').getAttribute('class'))?.includes('is-maintenance'), 'El mapa no reflejó mantenimiento.');
  await logout();

  // INGENIERO 2: recibe los datos persistidos y genera una segunda entrada.
  await login(engineer2, 'engineer2');
  assert(await page.locator('.calibration-toolbar').isHidden(), 'Ingeniero 2 ve el calibrador.');
  await openCameraFromMap('camera-03');
  const form2 = page.locator('.camera-edit-form');
  assert(await form2.locator('[name="status"]').inputValue() === 'En mantenimiento', 'Ingeniero 2 no recibió el estado guardado.');
  assert((await form2.locator('[name="notes"]').inputValue()).includes('Ingeniero 1'), 'No persistieron las observaciones anteriores.');
  await form2.locator('[name="status"]').selectOption('Operativa');
  await form2.locator('[name="lastMaintenanceOn"]').fill('2026-08-11');
  await form2.locator('[name="nextMaintenanceOn"]').fill('2026-12-11');
  await form2.locator('[name="responsibleArea"]').fill('Seguridad patrimonial');
  await form2.locator('[name="notes"]').fill('Ingeniero 2 confirmó operación después del mantenimiento preventivo.');
  await form2.getByRole('button', { name: 'Guardar cambios operativos' }).click();
  await page.waitForFunction(() => document.querySelector('.camera-edit-status')?.textContent?.includes('historial'));
  await closeViewerPanel();
  await logout();

  // JEFE: control centrado, lectura operativa e historial ordenado por perfil.
  await login(manager, 'manager');
  assert(await page.locator('.calibration-toolbar').isHidden(), 'El Jefe todavía ve el calibrador.');
  assert(await page.locator('.manager-audit-tools').isVisible(), 'El Jefe no ve el control superior.');
  const controlPosition = await page.locator('.manager-audit-tools').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return Math.abs(rect.left + rect.width / 2 - window.innerWidth / 2);
  });
  assert(controlPosition < 80, 'El control del Jefe no está centrado en la cabecera.');
  await openCameraFromMap('camera-03');
  assert(await page.locator('.camera-edit-form').count() === 0, 'El Jefe puede editar una cámara.');
  const managerCameraText = await page.locator('.camera-information').textContent();
  assert(managerCameraText?.includes('Ingeniero 2 confirmó operación'), 'El Jefe no ve el último cambio guardado.');
  await closeViewerPanel();

  await page.getByRole('button', { name: 'Control del Jefe' }).click();
  assert(await page.locator('.audit-tabs [role="tab"]').count() === 4, 'El historial no contiene cuatro pestañas de perfiles.');
  const latestText = await page.locator('.latest-access-summary').textContent();
  assert(latestText?.includes('Ingeniero 2') && latestText.includes('Duración:'), 'El resumen no muestra el último ingreso ajeno al Jefe y su duración.');

  await page.getByRole('tab', { name: 'Orbinodo' }).click();
  assert((await page.locator('.audit-profile-panel').textContent())?.includes('Orbinodo ingresó al software'), 'Falta el acceso de Orbinodo.');
  await page.getByRole('tab', { name: 'Jefe' }).click();
  assert((await page.locator('.audit-profile-panel').textContent())?.includes('Jefe ingresó al software'), 'Falta el acceso del Jefe.');
  await page.getByRole('tab', { name: 'Ingeniero 1' }).click();
  const engineer1Text = await page.locator('.audit-profile-panel').textContent();
  assert(engineer1Text?.includes('Ingeniero 1 modificó Cámara 3 - Pasillo'), 'Falta el cambio de Ingeniero 1.');
  assert(engineer1Text?.includes('Estado operativo'), 'El historial no detalla los campos modificados.');
  await page.getByRole('tab', { name: 'Ingeniero 2' }).click();
  const engineer2Text = await page.locator('.audit-profile-panel').textContent();
  assert(engineer2Text?.includes('Ingeniero 2 modificó Cámara 3 - Pasillo'), 'Falta el cambio de Ingeniero 2.');
  assert(engineer2Text?.includes('Duración: Menos de 1 minuto'), 'No se calculó la duración de la sesión del Ingeniero 2.');
  await assertCleanEncoding();
  await page.getByRole('button', { name: 'Cerrar historial' }).click();
  await page.screenshot({ path: 'fase7-verificacion.png', fullPage: true });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.psv-container');
  assert(await page.locator('#app').getAttribute('data-role') === 'manager', 'La sesión del Jefe no sobrevivió la recarga.');
  assert(await page.locator('.calibration-toolbar').isHidden(), 'El calibrador apareció al recargar como Jefe.');
  await logout();
  const meStatus = await page.evaluate(async () => {
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    return response.status;
  });
  const relevantErrors = errors.filter((error) => !error.includes('ERR_ABORTED'));
  assert(meStatus === 401, 'Cerrar sesión no invalidó la cookie del backend.');
  assert(relevantErrors.length === 0, 'Errores de navegador: ' + relevantErrors.join(' | '));
  console.log(JSON.stringify({
    roles: ['programmer', 'manager', 'engineer1', 'engineer2'],
    cleanUtf8Interface: true,
    mapsBelowViewer: true,
    independentSidebarScroll: true,
    managerControlCentered: true,
    auditProfileTabs: 4,
    explicitSessionDuration: true,
    programmerCalibrator: true,
    engineersCanEdit: true,
    managerReadOnly: true,
    cameraMapNodes: 10,
    explicitEngineerChanges: 2,
    managerSessionRefresh: true,
    manualArrowNavigation: true,
    errors: relevantErrors,
  }, null, 2));
} finally {
  await browser.close();
  await server.close();
  api.kill();
}
