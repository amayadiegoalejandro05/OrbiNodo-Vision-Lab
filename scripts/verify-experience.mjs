/* global console, process, document, getComputedStyle, setTimeout */
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { loadVisionLabVerificationConfig } from './vision-lab-verification-config.mjs';

const config = loadVisionLabVerificationConfig();
const { accounts, camera, environment } = config;

async function freePort() {
  const socket = createNetServer();
  await new Promise((ok) => socket.listen(0, '127.0.0.1', ok));
  const address = socket.address();
  if (!address || typeof address === 'string') throw new Error('No hay puerto libre.');
  await new Promise((ok) => socket.close(ok));
  return address.port;
}

const apiPort = await freePort();
const apiUrl = 'http://127.0.0.1:' + apiPort;
const api = spawn(process.execPath, [
  resolve('node_modules/tsx/dist/cli.mjs'), resolve('backend/server.ts'),
], {
  env: { ...process.env, ...environment, ORBINODO_API_PORT: String(apiPort) },
  stdio: 'ignore',
});

async function waitForApi() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(apiUrl + '/api/health')).ok) return;
    } catch { /* API is starting. */ }
    await new Promise((ok) => setTimeout(ok, 100));
  }
  throw new Error('La API temporal no inicio correctamente.');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let server;
let browser;
try {
  await waitForApi();
  process.env.ORBINODO_API_TARGET = apiUrl;
  server = await createServer({
    mode: 'vision-lab',
    server: { host: '127.0.0.1', port: 4176, strictPort: true },
  });
  await server.listen();
  browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--enable-webgl', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) => errors.push(request.url() + ': ' + request.failure()?.errorText));

  async function login(account) {
    await page.locator('#demo-username').fill(account.username);
    await page.locator('#demo-password').fill(account.password);
    await page.getByRole('button', { name: 'Entrar a Vision Lab' }).click();
    await page.waitForSelector('.psv-container');
    await page.waitForFunction(() => document.querySelector('#current-location')?.textContent?.includes('Robot Simulation'));
    assert(await page.locator('#app').getAttribute('data-role') === account.role, 'No se aplico el rol Vision Lab.');
  }

  async function logout() {
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await page.waitForSelector('#login-screen:not([hidden])');
  }

  async function openRobotCamera() {
    await page.locator('.camera-map-node[data-camera-id="' + camera.id + '"]').click();
    await page.waitForSelector('.camera-information');
    assert((await page.locator('.camera-information').textContent())?.includes(camera.assetCode), 'No se abrio CAM-ROBOT-01.');
  }

  await page.goto('http://127.0.0.1:4176/', { waitUntil: 'domcontentloaded' });
  assert(await page.locator('#login-screen').isVisible(), 'No aparecio el formulario Vision Lab.');

  await login(accounts.programmer);
  assert(await page.locator('.calibration-toolbar').isVisible(), 'Vision Admin no ve el calibrador.');
  assert(await page.locator('.camera-map-node').count() === 1, 'Vision Lab no tiene exactamente un activo inicial.');
  assert(await page.locator('.manager-audit-tools').isHidden(), 'Vision Admin ve auditoria reservada.');
  await openRobotCamera();
  assert(await page.locator('.camera-edit-form').count() === 0, 'Vision Admin pudo editar el activo.');
  await logout();

  await login(accounts.engineer1);
  await openRobotCamera();
  const firstForm = page.locator('.camera-edit-form');
  assert(await firstForm.isVisible(), 'Vision Operator 1 no puede editar.');
  await firstForm.locator('[name="status"]').selectOption('En mantenimiento');
  await firstForm.locator('[name="lastMaintenanceOn"]').fill('2026-09-04');
  await firstForm.locator('[name="nextMaintenanceOn"]').fill('2026-12-04');
  await firstForm.locator('[name="responsibleArea"]').fill('Vision Lab');
  await firstForm.locator('[name="notes"]').fill('Vision Operator 1 completed the stationary simulation review.');
  await firstForm.getByRole('button', { name: 'Guardar cambios operativos' }).click();
  await page.waitForFunction(() => document.querySelector('.camera-edit-status')?.textContent?.includes('historial'));
  await logout();

  await login(accounts.engineer2);
  await openRobotCamera();
  const secondForm = page.locator('.camera-edit-form');
  assert((await secondForm.locator('[name="notes"]').inputValue()).includes('Vision Operator 1'), 'La actualizacion no persistio entre operadores.');
  await secondForm.locator('[name="status"]').selectOption('Operativa');
  await secondForm.locator('[name="lastMaintenanceOn"]').fill('2026-09-05');
  await secondForm.locator('[name="nextMaintenanceOn"]').fill('2026-12-05');
  await secondForm.locator('[name="responsibleArea"]').fill('Vision Lab');
  await secondForm.locator('[name="notes"]').fill('Vision Operator 2 confirmed the stationary simulation state.');
  await secondForm.getByRole('button', { name: 'Guardar cambios operativos' }).click();
  await page.waitForFunction(() => document.querySelector('.camera-edit-status')?.textContent?.includes('historial'));
  await logout();

  await login(accounts.manager);
  assert(await page.locator('.calibration-toolbar').isHidden(), 'Vision Supervisor ve el calibrador.');
  assert(await page.locator('.manager-audit-tools').isVisible(), 'Vision Supervisor no ve auditoria.');
  await openRobotCamera();
  assert(await page.locator('.camera-edit-form').count() === 0, 'Vision Supervisor pudo editar el activo.');
  assert((await page.locator('.camera-information').textContent())?.includes('Vision Operator 2'), 'El supervisor no ve el ultimo cambio.');
  await page.getByRole('button', { name: 'Control del jefe' }).click();
  await page.waitForSelector('.audit-tabs [role="tab"]');
  assert(await page.locator('.audit-tabs [role="tab"]').count() === 4, 'Faltan roles internos en la auditoria.');
  for (const label of ['Vision Admin', 'Vision Supervisor', 'Vision Operator 1', 'Vision Operator 2']) {
    assert(await page.getByRole('tab', { name: label }).isVisible(), 'Falta la pestana ' + label + '.');
  }
  await page.screenshot({ path: join(tmpdir(), 'vision-lab-browser-verification.png'), fullPage: true });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.psv-container');
  assert(await page.locator('#app').getAttribute('data-role') === 'manager', 'La sesion del supervisor no sobrevivio la recarga.');
  await logout();
  const status = await page.evaluate(async () => (await fetch('/api/auth/me', { credentials: 'include' })).status);
  assert(status === 401, 'Cerrar sesion no invalido la cookie.');
  assert(errors.filter((error) => !error.includes('ERR_ABORTED')).length === 0, 'Errores de navegador: ' + errors.join(' | '));
  console.log(JSON.stringify({
    profile: 'vision-lab',
    camera: camera.assetCode,
    roles: ['programmer', 'manager', 'engineer1', 'engineer2'],
    postgresqlCameraChanges: true,
    managerSessionRefresh: true,
  }, null, 2));
} finally {
  await browser?.close();
  await server?.close();
  api.kill();
}
