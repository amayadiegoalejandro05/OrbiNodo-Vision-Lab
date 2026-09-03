/* global document, process */
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const configuredBaseUrl = process.argv[2] || process.env.ORBINODO_PUBLIC_URL;
if (!configuredBaseUrl) throw new Error('Falta ORBINODO_PUBLIC_URL o una URL como primer argumento.');
const baseUrl = configuredBaseUrl.replace(/\/$/, '');
const username = process.env.ORBINODO_VERIFY_MANAGER_USERNAME;
const expectedCameraCount = Number.parseInt(process.env.ORBINODO_VERIFY_CAMERA_COUNT || '', 10);
const password = process.env.ORBINODO_SEED_MANAGER_PASSWORD;
if (!username || !password || !Number.isInteger(expectedCameraCount) || expectedCameraCount < 1) {
  throw new Error('Faltan las variables de verificacion de instancia.');
}

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
  args: ['--enable-webgl', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('requestfailed', (request) => {
  if (request.failure()?.errorText !== 'net::ERR_ABORTED') errors.push(request.url());
});
function ensure(condition, message) { if (!condition) throw new Error(message); }

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#login-screen:not([hidden])');
  ensure(await page.locator('#login-screen').isVisible(), 'No apareció el formulario de acceso.');
  await page.locator('#demo-username').fill(username);
  await page.locator('#demo-password').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForSelector('.psv-container');
  ensure(await page.locator('#app').getAttribute('data-role') === 'manager', 'No se aplico el perfil de auditoria.');
  ensure(await page.locator('.manager-audit-tools').isVisible(), 'No aparece el control de auditoria.');
  ensure(await page.locator('.camera-map-node').count() === expectedCameraCount, 'El mapa no muestra la cantidad configurada de camaras.');
  await page.screenshot({ path: resolve('.vercel', 'production-verification.png'), fullPage: true });
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.waitForSelector('#login-screen:not([hidden])');
  ensure(errors.length === 0, 'El navegador detectó errores: ' + errors.join(' | '));
  console.log('Interfaz verificada: login, panorama, perfil de auditoria, control y camaras configuradas.');
} finally {
  await browser.close();
}
