import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import type { ActuatorStatus, VisionStatus } from '../api/vision-service-api';
import type { SecurityCameraRecord } from '../domain/security-camera.types';
import type { RobotVisionApi } from './robot-vision';

const camera: SecurityCameraRecord = {
  id: 'robot-test', version: 1, assetCode: 'CAM-ROBOT-01', name: 'Robot',
  panoramaId: 'test', location: 'Lab', brand: 'Logitech', model: 'Brio', type: 'Fija',
  yaw: 0, pitch: 0, status: 'Operativa', installedOn: '', lastMaintenanceOn: '',
  nextMaintenanceOn: '', coverage: '', recordingMode: '', retention: '', responsibleArea: '', notes: '',
};
const diego = { status: 'AUTHORIZED' as const, person_id: 1, name: 'Diego', similarity: 0.82 };

// Exercise the real dialog, CSS, polling and API in a browser; every Vision Node
// request is intercepted, so these tests cannot start a camera or move hardware.
describe('supervisión Robot Vision en navegador', () => {
  let server: ViteDevServer;
  let browser: Browser;
  let page: Page;
  let origin: string;
  let vision: VisionStatus;
  let actuator: ActuatorStatus;
  let visionFailed: boolean;
  let actuatorGate: Promise<void> | undefined;
  let visionGate: Promise<void> | undefined;
  let requests: string[];

  beforeAll(async () => {
    server = await createServer({
      configFile: false,
      cacheDir: 'node_modules/.vite-robot-vision-tests',
      define: { 'import.meta.env.VITE_VISION_SERVICE_URL': JSON.stringify('http://vision.test') },
      server: { host: '127.0.0.1', port: 0 },
    });
    await server.listen();
    origin = server.resolvedUrls!.local[0];
    browser = await chromium.launch({
      executablePath: process.env.ROBOT_VISION_BROWSER_PATH ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      headless: true,
    });
  }, 30_000);

  afterAll(async () => { await browser?.close(); await server?.close(); });
  afterEach(async () => { await page?.close(); });

  beforeEach(async () => {
    vision = {
      camera: camera.assetCode, state: 'RUNNING', prepared: true, running: true,
      fps: 30, timestamp: '2026-10-06T15:00:00Z', error: null, faces: [diego],
      active_face_index: 0, active_user: diego, blink_count: 0, blink_target: 3, blink_confirmed: false,
    };
    actuator = { configured: true, available: true, state: 'CLOSED', servo_angle: 0 };
    visionFailed = false;
    actuatorGate = undefined;
    visionGate = undefined;
    requests = [];
    page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    await page.route('http://vision.test/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      requests.push(`${route.request().method()} ${path}`);
      let body: unknown;
      let status = 200;
      if (path === '/health') body = { status: 'ok', models: 'ready', state: 'READY' };
      else if (path === '/api/vision/people') body = [{ enabled: true }];
      else if (path === '/api/vision/stop') body = { ...vision, running: false };
      else if (path === '/api/vision/start') body = vision;
      else if (path === '/api/vision/status') {
        const snapshot = structuredClone(vision);
        await visionGate;
        status = visionFailed ? 500 : 200;
        body = snapshot;
      } else if (path === '/api/actuator/status') {
        await actuatorGate;
        status = actuator.available ? 200 : 503;
        body = actuator;
      } else if (path === '/stream.mjpg') {
        // A minimal MJPEG frame, supplied only to the intercepted stream URL.
        const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAIBAQEBAQIBAQECAgICAgQDAgICAgUEBAMEBgUGBgYFBgYGBwkIBgcJBwYGCAsICQoKCgoKBggLDAsKDAkKCgr/2wBDAQICAgICAgUDAwUKBwYHCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgr/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD+f+iiigD/2Q==', 'base64');
        await route.fulfill({ contentType: 'multipart/x-mixed-replace; boundary=frame', body: Buffer.concat([
          Buffer.from('--frame\r\nContent-Type: image/jpeg\r\n\r\n'), jpeg, Buffer.from('\r\n--frame--\r\n'),
        ]) });
        return;
      } else throw new Error(`Unexpected hardware request: ${path}`);
      await route.fulfill({ status, json: body });
    });
    await page.route('**/robot-vision-test', (route) => route.fulfill({ contentType: 'text/html', body: `
      <html><head><link rel="stylesheet" href="/src/styles/robot-vision.css"></head><body>
      <script type="module">import { createRobotVision } from '/src/ui/robot-vision.ts';
      window.robotVision = createRobotVision(); window.robotVision.open(${JSON.stringify(camera)});</script>
      </body></html>` }));
    await page.goto(origin + 'robot-vision-test');
    await expect.poll(() => page.locator('[data-robot-service-status]').textContent()).toBe('LISTO');
  }, 30_000);

  async function text(selector: string, value: string): Promise<void> {
    await expect.poll(() => page.locator(selector).textContent()).toBe(value);
  }
  async function start(): Promise<void> {
    await page.locator('[data-robot-activate]').click();
    await text('[data-robot-video-status]', 'EN VIVO');
  }

  it('muestra el usuario elegido por el servicio, progreso 0→3 y los cuatro estados del actuador', async () => {
    const unknown = { status: 'UNKNOWN' as const, person_id: null, name: null, similarity: 0.2 };
    vision.faces = [unknown, diego];
    vision.active_face_index = 1;
    await start();
    await text('[data-robot-active-user]', 'Diego');
    await text('[data-robot-recognition]', 'AUTHORIZED');
    await text('[data-robot-blinks]', '0 / 3');
    await text('[data-robot-confirmation]', 'PENDIENTE');
    for (const count of [1, 2, 3]) {
      vision.blink_count = count;
      vision.blink_confirmed = count === 3;
      await text('[data-robot-blinks]', `${count} / 3`);
    }
    await text('[data-robot-confirmation]', 'CONFIRMADA');
    for (const state of ['CLOSED', 'OPENING', 'OPEN_HOLD', 'CLOSING'] as const) {
      actuator = { configured: true, available: true, state, servo_angle: 0 };
      await text('[data-robot-actuator]', state);
    }
    expect(requests.some((request) => request.includes('/api/actuator/open'))).toBe(false);
    expect(await page.locator('.robot-vision-actions button').count()).toBe(2);
  }, 15_000);

  it('conserva UNKNOWN y su alerta, limpia la confirmación al perder el usuario', async () => {
    vision.active_user = { status: 'UNKNOWN', person_id: null, name: null, similarity: 0.2 };
    vision.faces = [vision.active_user];
    await start();
    await text('[data-robot-recognition]', 'UNKNOWN');
    await text('[data-robot-active-user]', 'Persona no reconocida');
    await expect.poll(() => page.locator('[data-robot-alert]').isVisible()).toBe(true);
    vision.active_user = null;
    vision.active_face_index = null;
    vision.faces = [];
    await text('[data-robot-recognition]', 'SIN ROSTRO ACTIVO');
    await text('[data-robot-active-user]', 'Sin usuario activo');
    await text('[data-robot-confirmation]', 'PENDIENTE');
    await expect.poll(() => page.locator('[data-robot-alert]').isVisible()).toBe(false);
  });

  it('tolera actuador no configurado/no disponible y recupera su estado sin interrumpir visión', async () => {
    actuator = { configured: false, available: false, error: 'Not configured' };
    await start();
    await text('[data-robot-actuator]', 'NO CONFIGURADO');
    actuator = { configured: true, available: false, error: 'Unreachable' };
    await text('[data-robot-actuator]', 'NO DISPONIBLE');
    vision.blink_count = 1;
    await text('[data-robot-blinks]', '1 / 3');
    await text('[data-robot-video-status]', 'EN VIVO');
    actuator = { configured: true, available: true, state: 'CLOSED', servo_angle: 0 };
    await text('[data-robot-actuator]', 'CLOSED');
  });

  it('un actuador lento no bloquea las lecturas de visión ni acumula consultas', async () => {
    await text('[data-robot-actuator]', 'CLOSED');
    let release!: () => void;
    actuatorGate = new Promise<void>((resolve) => { release = resolve; });
    const previous = requests.filter((request) => request === 'GET /api/actuator/status').length;
    await start();
    vision.blink_count = 1;
    await text('[data-robot-blinks]', '1 / 3');
    vision.blink_count = 2;
    await text('[data-robot-blinks]', '2 / 3');
    expect(requests.filter((request) => request === 'GET /api/actuator/status').length).toBe(previous + 1);
    actuatorGate = undefined;
    actuator = { configured: true, available: true, state: 'OPEN_HOLD', servo_angle: 90 };
    release();
    await text('[data-robot-actuator]', 'OPEN_HOLD');
  });

  it('conserva el stream y start/stop, descarta respuestas pendientes después de detener', async () => {
    vision.blink_count = 3;
    vision.blink_confirmed = true;
    await start();
    await text('[data-robot-confirmation]', 'CONFIRMADA');
    expect(await page.locator('.robot-vision-stream').getAttribute('src')).toBe('http://vision.test/stream.mjpg');
    expect(await page.locator('.robot-vision-stream').isVisible()).toBe(true);
    await expect.poll(() => page.locator('.robot-vision-stream').evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(await page.locator('.robot-vision-video-placeholder').isVisible()).toBe(false);
    let release!: () => void;
    visionGate = new Promise<void>((resolve) => { release = resolve; });
    const before = requests.filter((request) => request === 'GET /api/vision/status').length;
    await expect.poll(() => requests.filter((request) => request === 'GET /api/vision/status').length).toBeGreaterThan(before);
    await page.locator('[data-robot-stop]').click();
    release();
    visionGate = undefined;
    await text('[data-robot-confirmation]', 'PENDIENTE');
    await text('[data-robot-active-user]', 'Sin usuario activo');
    await text('[data-robot-recognition]', 'INACTIVO');
    expect(await page.locator('.robot-vision-stream').getAttribute('src')).toBeNull();
    expect(await page.locator('.robot-vision-stream').isVisible()).toBe(false);
    expect(await page.locator('.robot-vision-video-placeholder').isVisible()).toBe(true);
    expect(requests).toContain('POST /api/vision/start');
    expect(requests).toContain('POST /api/vision/stop');
    await start();
    await text('[data-robot-active-user]', 'Diego');
  });

  it.each(['En mantenimiento', 'Fuera de servicio'] as const)('detiene y bloquea una cámara %s', async (status) => {
    await start();
    await page.evaluate((updated) => {
      (window as unknown as { robotVision: RobotVisionApi }).robotVision.updateCamera(updated);
    }, { ...camera, status });
    await text('[data-robot-recognition]', 'INACTIVO');
    expect(await page.locator('[data-robot-activate]').isDisabled()).toBe(true);
    expect(await page.locator('.robot-vision-stream').getAttribute('src')).toBeNull();
    const count = requests.filter((request) => request === 'POST /api/vision/start').length;
    await page.locator('[data-robot-activate]').dispatchEvent('click');
    expect(requests.filter((request) => request === 'POST /api/vision/start').length).toBe(count);
  });

  it('limpia lecturas al fallar Vision Service y permite volver a iniciar', async () => {
    await start();
    visionFailed = true;
    await text('[data-robot-service-status]', 'ERROR');
    await text('[data-robot-recognition]', 'INACTIVO');
    await text('[data-robot-confirmation]', 'PENDIENTE');
    expect(await page.locator('[data-robot-activate]').isDisabled()).toBe(false);
    expect(await page.locator('.robot-vision-stream').getAttribute('src')).toBeNull();
    visionFailed = false;
    await start();
    await text('[data-robot-active-user]', 'Diego');
  });
});
