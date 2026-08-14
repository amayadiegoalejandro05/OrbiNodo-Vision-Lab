/* global document, process */
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const baseUrl = (process.argv[2] || 'https://orbinodo-demo.vercel.app').replace(/\/$/, '');
const password = process.env.ORBINODO_SEED_MANAGER_PASSWORD;
if (!password) throw new Error('Falta la contraseña local del Jefe.');

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
  await page.locator('#demo-username').fill('Jefe');
  await page.locator('#demo-password').fill(password);
  await page.getByRole('button', { name: 'Entrar a Orbinodo' }).click();
  await page.waitForSelector('.psv-container');
  await page.waitForFunction(() => document.querySelector('#current-location')?.textContent?.includes('Parqueadero'));
  ensure(await page.locator('#app').getAttribute('data-role') === 'manager', 'No se aplicó el perfil Jefe.');
  ensure(await page.locator('.manager-audit-tools').isVisible(), 'No aparece el control del Jefe.');
  ensure(await page.locator('.camera-map-node').count() === 10, 'El mapa no muestra las 10 cámaras.');
  await page.screenshot({ path: resolve('.vercel', 'production-verification.png'), fullPage: true });
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.waitForSelector('#login-screen:not([hidden])');
  ensure(errors.length === 0, 'El navegador detectó errores: ' + errors.join(' | '));
  console.log('Interfaz verificada: login, panorama, perfil Jefe, control y 10 cámaras.');
} finally {
  await browser.close();
}
