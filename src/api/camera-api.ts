import { z } from 'zod';
import type {
  CameraOperationalUpdate, CameraUpdateResult, SecurityCameraRecord,
} from '../domain/security-camera.types';

const cameraSchema = z.object({
  id: z.string(), assetCode: z.string(), name: z.string(), panoramaId: z.string(),
  location: z.string(), brand: z.string(), model: z.string(),
  type: z.enum(['360°', 'Fija']), yaw: z.number(), pitch: z.number(),
  status: z.enum(['Operativa', 'En mantenimiento', 'Fuera de servicio']),
  installedOn: z.string(), lastMaintenanceOn: z.string(),
  nextMaintenanceOn: z.string(), coverage: z.string(), recordingMode: z.string(),
  retention: z.string(), responsibleArea: z.string(), notes: z.string(),
}).strict();

const listSchema = z.object({ cameras: z.array(cameraSchema) }).strict();
const updateSchema = z.object({
  camera: cameraSchema,
  changedFields: z.array(z.enum([
    'status', 'lastMaintenanceOn', 'nextMaintenanceOn', 'responsibleArea', 'notes',
  ])),
}).strict();

async function jsonOrNull(response: Response): Promise<unknown> {
  try { return await response.json(); }
  catch { return null; }
}

function apiMessage(value: unknown, fallback: string): string {
  if (!value || typeof value !== 'object') return fallback;
  const message = (value as { message?: unknown }).message;
  return typeof message === 'string' ? message : fallback;
}

export async function getCamerasFromApi(): Promise<SecurityCameraRecord[]> {
  const response = await fetch('/api/cameras', { credentials: 'include' });
  const value = await jsonOrNull(response);
  if (!response.ok) throw new Error(apiMessage(value, 'No fue posible cargar las cámaras.'));
  const parsed = listSchema.safeParse(value);
  if (!parsed.success) throw new Error('La API devolvió cámaras no válidas.');
  return parsed.data.cameras;
}

export async function updateCameraOperations(
  cameraId: string,
  update: CameraOperationalUpdate,
): Promise<CameraUpdateResult> {
  const response = await fetch(`/api/cameras/${encodeURIComponent(cameraId)}/operations`, {
    method: 'PATCH', credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(update),
  });
  const value = await jsonOrNull(response);
  if (!response.ok) {
    throw new Error(apiMessage(value, 'No fue posible guardar los cambios.'));
  }
  const parsed = updateSchema.safeParse(value);
  if (!parsed.success) throw new Error('La API devolvió una actualización no válida.');
  return parsed.data;
}
