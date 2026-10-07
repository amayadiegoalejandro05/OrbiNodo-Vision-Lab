/* global console, process, setTimeout */
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
    // This check verifies composition/authentication, never physical hardware.
    define: { 'import.meta.env.VITE_VISION_SERVICE_URL': JSON.stringify('http://vision.test') },
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
  await page.route('http://vision.test/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const responses = {
      '/health': { status: 'ok', models: 'ready', state: 'READY' },
      '/api/vision/people': [],
      '/api/vision/stop': { running: false },
      '/api/actuator/status': { configured: true, available: true, state: 'CLOSED', servo_angle: 0 },
    };
    assert(path in responses, 'Peticion de hardware no permitida: ' + path);
    await route.fulfill({ json: responses[path] });
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) => errors.push(request.url() + ': ' + request.failure()?.errorText));

  async function login(account) {
    await page.locator('#demo-username').fill(account.username);
    await page.locator('#demo-password').fill(account.password);
    await page.getByRole('button', { name: 'Entrar a Vision Lab' }).click();
    await page.waitForSelector('#app[data-ready="true"] [data-vision-lab-robot]');
    assert(await page.locator('#app').getAttribute('data-role') === account.role, 'No se aplico el rol Vision Lab.');
    assert(await page.locator('#tour-workspace').isHidden(), 'Vision Lab monto el recorrido.');
    assert(await page.locator('.psv-container').count() === 0, 'Vision Lab monto el visor panoramico.');
    assert(await page.locator('#tour-minimap').isHidden(), 'Vision Lab muestra el minimapa.');
  }

  async function logout() {
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await page.waitForSelector('#login-screen:not([hidden])');
  }

  async function openRobotCamera() {
    await page.locator('[data-vision-lab-robot]').click();
    await page.waitForSelector('.robot-vision-dialog[open]');
    assert(await page.locator('[data-robot-camera-code]').textContent() === camera.assetCode, 'No se abrio CAM-ROBOT-01.');
  }

  await page.goto('http://127.0.0.1:4176/', { waitUntil: 'domcontentloaded' });
  assert(await page.locator('#login-screen').isVisible(), 'No aparecio el formulario Vision Lab.');

  for (const account of [accounts.programmer, accounts.engineer1, accounts.engineer2, accounts.manager]) {
    await login(account);
    await openRobotCamera();
    await page.locator('.robot-vision-close').click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app[data-ready="true"] [data-vision-lab-robot]');
    assert(await page.locator('#app').getAttribute('data-role') === account.role, 'La sesion no sobrevivio la recarga.');
    await logout();
  }
  await login(accounts.programmer);
  await page.screenshot({ path: join(tmpdir(), 'vision-lab-browser-verification.png'), fullPage: true });
  await logout();
  const status = await page.evaluate(async () => (await fetch('/api/auth/me', { credentials: 'include' })).status);
  assert(status === 401, 'Cerrar sesion no invalido la cookie.');
  assert(errors.filter((error) => !error.includes('ERR_ABORTED')).length === 0, 'Errores de navegador: ' + errors.join(' | '));
  console.log(JSON.stringify({
    profile: 'vision-lab',
    camera: camera.assetCode,
    roles: ['programmer', 'manager', 'engineer1', 'engineer2'],
    standaloneLab: true,
    directRobotVision: true,
    panoramaMounted: false,
    sessionRefresh: true,
  }, null, 2));
} finally {
  await browser?.close();
  await server?.close();
  api.kill();
}
