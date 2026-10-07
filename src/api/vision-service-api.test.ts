import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canStartVisionService,
  createUnknownAlertConfirmation,
  resolveVisionServiceConfiguration,
} from '../config/vision-service';
import { getActuatorStatus, getVisionServiceHealth, getVisionServiceStatus, startVisionService, stopVisionService } from './vision-service-api';

afterEach(() => vi.unstubAllGlobals());

describe('cliente de Vision Service', () => {
  it('informa health no disponible sin ocultar el fallo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    await expect(getVisionServiceHealth()).rejects.toThrow('503');
  });

  it('usa start y stop HTTP sin datos biométricos', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ running: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await startVisionService();
    await stopVisionService();
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:8765/api/vision/start', { method: 'POST' });
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://127.0.0.1:8765/api/vision/stop', { method: 'POST' });
  });

  it('confirma UNKNOWN consecutivo y aplica cooldown', () => {
    const confirmation = createUnknownAlertConfirmation();
    expect(confirmation.observe(true, 100)).toBe(false);
    expect(confirmation.observe(true, 200)).toBe(false);
    expect(confirmation.observe(true, 300)).toBe(true);
    expect(confirmation.observe(true, 400)).toBe(false);
    expect(confirmation.observe(false, 500)).toBe(false);
  });

  it('mantiene múltiples rostros del estado público sin embeddings', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      camera: 'CAM-ROBOT-01', running: true, fps: 30, timestamp: null, error: null,
      faces: [
        { status: 'AUTHORIZED', person_id: 1, name: 'Diego', similarity: 0.82 },
        { status: 'UNKNOWN', person_id: null, name: null, similarity: 0.21 },
      ],
      active_face_index: 0,
      active_user: { status: 'AUTHORIZED', person_id: 1, name: 'Diego', similarity: 0.82 },
      blink_count: 2, blink_target: 3, blink_confirmed: false,
    }), { status: 200 })));
    await expect(getVisionServiceStatus()).resolves.toMatchObject({ faces: expect.arrayContaining([expect.objectContaining({ status: 'AUTHORIZED' }), expect.objectContaining({ status: 'UNKNOWN' })]) });
    await expect(getVisionServiceStatus()).resolves.toMatchObject({
      active_face_index: 0, active_user: expect.objectContaining({ name: 'Diego' }),
      blink_count: 2, blink_target: 3, blink_confirmed: false,
    });
  });

  it.each(['CLOSED', 'OPENING', 'OPEN_HOLD', 'CLOSING'])('consulta %s únicamente a través de Vision Service', async (state) => {
    const status = { state, servo_angle: 0, configured: true, available: true };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(status), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getActuatorStatus()).resolves.toEqual(status);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('http://127.0.0.1:8765/api/actuator/status', undefined);
  });

  it.each([false, true])('conserva el diagnóstico HTTP 503 con configured=%s', async (configured) => {
    const status = { configured, available: false, error: 'Actuator unavailable.' };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(status), { status: 503 })));
    await expect(getActuatorStatus()).resolves.toEqual(status);
  });

  it('no oculta errores HTTP inesperados del actuador', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
    await expect(getActuatorStatus()).rejects.toThrow('500');
  });

  it('rechaza un 503 sin el diagnóstico esperado', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    await expect(getActuatorStatus()).rejects.toThrow('503');
  });

  it('propaga fallos de red y permite cancelar la consulta del actuador', async () => {
    const fetchMock = vi.fn(async () => { throw new TypeError('Network unavailable'); });
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    await expect(getActuatorStatus({ signal: controller.signal })).rejects.toThrow('Network unavailable');
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8765/api/actuator/status', { signal: controller.signal });
  });

  it('bloquea start cuando el estado operacional no es Operativa', () => {
    expect(canStartVisionService('Operativa')).toBe(true);
    expect(canStartVisionService('En mantenimiento')).toBe(false);
    expect(canStartVisionService('Fuera de servicio')).toBe(false);
  });

  it('rechaza HTTP y localhost en modo desplegado', () => {
    expect(resolveVisionServiceConfiguration(undefined, true)).toEqual({
      url: null,
      error: 'Vision Service requires an HTTPS endpoint in deployed mode.',
    });
    expect(resolveVisionServiceConfiguration('http://127.0.0.1:8765', true).url).toBeNull();
    expect(resolveVisionServiceConfiguration('https://vision.example.test/', true)).toEqual({
      url: 'https://vision.example.test',
      error: null,
    });
  });
});
