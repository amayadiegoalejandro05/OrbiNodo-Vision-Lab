import { VISION_SERVICE_CONFIGURATION } from '../config/vision-service';

export interface VisionFace {
  status: 'AUTHORIZED' | 'UNKNOWN';
  person_id: number | null;
  name: string | null;
  similarity: number;
}

export interface VisionStatus {
  camera: string;
  state: 'INITIALIZING' | 'READY' | 'RUNNING' | 'ERROR';
  prepared: boolean;
  running: boolean;
  fps: number;
  faces: VisionFace[];
  active_face_index: number | null;
  active_user: VisionFace | null;
  blink_count: number;
  blink_target: number;
  blink_confirmed: boolean;
  timestamp: string | null;
  error: string | null;
}

export interface VisionHealth {
  status: 'ok' | 'degraded';
  camera: string;
  camera_index: number;
  state: 'INITIALIZING' | 'READY' | 'RUNNING' | 'ERROR';
  prepared: boolean;
  running: boolean;
  database: string;
  models: string;
}

export interface VisionPerson { id: number; name: string; enabled: boolean; embedding_count: number; }

export type ActuatorState = 'CLOSED' | 'OPENING' | 'OPEN_HOLD' | 'CLOSING';

export type ActuatorStatus = {
  configured: true;
  available: true;
  state: ActuatorState;
  servo_angle: number;
} | {
  configured: boolean;
  available: false;
  error: string;
};

function url(path: string): string {
  if (VISION_SERVICE_CONFIGURATION.error || !VISION_SERVICE_CONFIGURATION.url) {
    throw new Error(VISION_SERVICE_CONFIGURATION.error ?? 'Vision Service is not configured.');
  }
  return VISION_SERVICE_CONFIGURATION.url + path;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url(path), init);
  if (!response.ok) throw new Error(`Vision Service respondió ${response.status}.`);
  return response.json() as Promise<T>;
}

export function getVisionServiceHealth(): Promise<VisionHealth> { return request('/health'); }
export function getVisionServiceStatus(): Promise<VisionStatus> { return request('/api/vision/status'); }
export async function getActuatorStatus(init?: Pick<RequestInit, 'signal'>): Promise<ActuatorStatus> {
  const response = await fetch(url('/api/actuator/status'), init);
  if (response.status === 503) {
    const status = await response.json() as ActuatorStatus;
    if (typeof status.configured === 'boolean' && status.available === false && typeof status.error === 'string') return status;
  }
  if (!response.ok) throw new Error(`Vision Service respondió ${response.status}.`);
  return response.json() as Promise<ActuatorStatus>;
}
export function startVisionService(): Promise<VisionStatus> { return request('/api/vision/start', { method: 'POST' }); }
export function stopVisionService(): Promise<VisionStatus> { return request('/api/vision/stop', { method: 'POST' }); }
export function getVisionPeople(): Promise<VisionPerson[]> { return request('/api/vision/people'); }
export function getVisionStreamUrl(): string { return url('/stream.mjpg'); }
