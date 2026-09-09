import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canStartVisionService,
  createUnknownAlertConfirmation,
  resolveVisionServiceConfiguration,
} from '../config/vision-service';
import { getVisionServiceHealth, getVisionServiceStatus, startVisionService, stopVisionService } from './vision-service-api';

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
    }), { status: 200 })));
    await expect(getVisionServiceStatus()).resolves.toMatchObject({ faces: expect.arrayContaining([expect.objectContaining({ status: 'AUTHORIZED' }), expect.objectContaining({ status: 'UNKNOWN' })]) });
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
