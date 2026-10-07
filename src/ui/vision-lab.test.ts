import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { getClientProfile } from '../../client-config/client-profiles';
import type { SecurityCameraRecord } from '../domain/security-camera.types';

// Load the real application with isolated API responses. No database or hardware
// request is allowed through these tests.
describe('composición de la aplicación por perfil', () => {
  let server: ViteDevServer;
  let browser: Browser;
  let page: Page;
  let origin: string;
  let profile: 'vision-lab' | 'orbinodo-demo';
  let cameras: SecurityCameraRecord[];
  let authenticated: boolean;
  let requests: string[];
  let errors: string[];

  beforeAll(async () => {
    server = await createServer({
      configFile: false,
      cacheDir: 'node_modules/.vite-vision-lab-composition-tests',
      define: { 'import.meta.env.VITE_VISION_SERVICE_URL': JSON.stringify('http://vision.test') },
      server: { host: '127.0.0.1', port: 0 },
    });
    await server.listen();
    origin = server.resolvedUrls!.local[0];
    browser = await chromium.launch({
      executablePath: process.env.ROBOT_VISION_BROWSER_PATH ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      headless: true,
      args: ['--enable-webgl', '--use-angle=swiftshader'],
    });
  }, 30_000);
  afterAll(async () => { await browser?.close(); await server?.close(); });
  afterEach(async () => { await page?.close(); });

  beforeEach(async () => {
    profile = 'vision-lab';
    cameras = structuredClone(getClientProfile(profile).cameras);
    authenticated = false;
    requests = [];
    errors = [];
    page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    page.on('request', (request) => requests.push(request.method() + ' ' + request.url()));
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/src/config/active-client-profile.ts', (route) => route.fulfill({
      contentType: 'text/javascript',
      body: `import { getClientProfile } from '/client-config/client-profiles.ts';
        export const activeClientProfile = getClientProfile('${profile}');`,
    }));
    await page.route((url) => url.origin === new URL(origin).origin && url.pathname.startsWith('/api/'), async (route) => {
      const path = new URL(route.request().url()).pathname;
      const user = { role: 'programmer', displayName: 'Test Admin', username: 'test-admin' };
      if (path === '/api/auth/login') { authenticated = true; await route.fulfill({ json: { user } }); }
      else if (path === '/api/auth/me') await route.fulfill({ status: authenticated ? 200 : 401, json: { user } });
      else if (path === '/api/auth/logout') { authenticated = false; await route.fulfill({ json: { ok: true } }); }
      else if (path === '/api/cameras') await route.fulfill({ json: { cameras } });
      else throw new Error(`Unexpected backend request: ${path}`);
    });
    await page.route('http://vision.test/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/health') await route.fulfill({ json: { status: 'ok', models: 'ready', state: 'READY' } });
      else if (path === '/api/vision/people') await route.fulfill({ json: [] });
      else if (path === '/api/actuator/status') await route.fulfill({ json: { configured: true, available: true, state: 'CLOSED', servo_angle: 0 } });
      else if (path === '/api/vision/stop') await route.fulfill({ json: { running: false } });
      else throw new Error(`Unexpected hardware request: ${path}`);
    });
  });

  async function login(): Promise<void> {
    await page.goto(origin);
    await page.locator('#demo-username').fill('test-admin');
    await page.locator('#demo-password').fill('test-only');
    await page.locator('#login-form button').click();
    await page.waitForSelector('#app[data-ready="true"]');
  }

  it('vision-lab abre el activo real directamente sin montar ni descargar el recorrido', async () => {
    // Neither camera id nor its panorama is required to match a client tour node.
    cameras[0].id = 'database-robot-id';
    cameras[0].panoramaId = 'no-panorama';
    await login();
    expect(await page.locator('#vision-lab-workspace').isVisible()).toBe(true);
    expect(await page.locator('#tour-workspace').isVisible()).toBe(false);
    expect(await page.locator('#tour-minimap').isVisible()).toBe(false);
    expect(await page.locator('.psv-container').count()).toBe(0);
    const asset = page.locator('[data-vision-lab-robot]');
    expect(await asset.textContent()).toContain('CAM-ROBOT-01');
    expect(await asset.getAttribute('data-camera-id')).toBe('database-robot-id');
    await asset.click();
    expect(await page.locator('.robot-vision-dialog').isVisible()).toBe(true);
    expect(await page.locator('[data-robot-camera-code]').textContent()).toBe('CAM-ROBOT-01');
    await expect.poll(() => page.locator('[data-robot-service-status]').textContent()).toBe('LISTO');
    expect(await page.locator('.camera-information').count()).toBe(0);
    expect(requests.some((url) => url.includes('/src/viewer/panorama-viewer') || url.includes('/panoramas/'))).toBe(false);
    expect(requests.some((url) => url.includes('/api/actuator/open'))).toBe(false);
    expect(requests.every((request) => {
      const host = new URL(request.slice(request.indexOf(' ') + 1)).hostname;
      return host === '127.0.0.1' || host === 'vision.test';
    })).toBe(true);
    expect(errors).toEqual([]);
  }, 30_000);

  it('no inventa un activo cuando CAM-ROBOT-01 falta en la API', async () => {
    cameras = [];
    await login();
    expect(await page.locator('[data-vision-lab-robot]').isDisabled()).toBe(true);
    expect(await page.locator('[data-vision-lab-camera-status]').textContent()).toBe('Sin registro de cámara');
    expect(await page.locator('.robot-vision-dialog').isVisible()).toBe(false);
  });

  it('refresca el estado operacional y conserva el bloqueo de mantenimiento', async () => {
    await login();
    cameras[0].status = 'En mantenimiento';
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect.poll(() => page.locator('[data-vision-lab-camera-status]').textContent()).toBe('En mantenimiento');
    await page.locator('[data-vision-lab-robot]').click();
    expect(await page.locator('[data-robot-operational-status]').textContent()).toBe('En mantenimiento');
    expect(await page.locator('[data-robot-activate]').isDisabled()).toBe(true);
    expect(requests.some((url) => url.includes('/api/vision/start'))).toBe(false);
  });

  it('conserva el recorrido panorámico, minimapa y mapa de cámaras en orbinodo-demo', async () => {
    profile = 'orbinodo-demo';
    cameras = structuredClone(getClientProfile(profile).cameras);
    await login();
    await page.waitForSelector('.psv-container');
    expect(await page.locator('#tour-workspace').isVisible()).toBe(true);
    expect(await page.locator('#tour-minimap').isVisible()).toBe(true);
    expect(await page.locator('.camera-map-node').count()).toBe(cameras.length);
    expect(await page.locator('[data-vision-lab-robot]').count()).toBe(0);
    expect(requests.some((url) => url.includes('/src/viewer/panorama-viewer'))).toBe(true);
    expect(errors).toEqual([]);
  }, 30_000);

  it('restaura la sesión del laboratorio y desmonta la pantalla al cerrar sesión', async () => {
    await login();
    await page.reload();
    await page.waitForSelector('[data-vision-lab-robot]');
    expect(await page.locator('.psv-container').count()).toBe(0);
    await page.locator('#logout-button').click();
    await page.waitForSelector('#login-screen:not([hidden])');
    expect(await page.locator('[data-vision-lab-robot]').count()).toBe(0);
    expect(await page.locator('#app').isVisible()).toBe(false);
  });
});
