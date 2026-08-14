import { z } from 'zod';
import type { AuditHistory } from '../domain/audit.types';

const roleSchema = z.enum(['programmer', 'manager', 'engineer1', 'engineer2']);
const accessSchema = z.object({
  id: z.string(), timestamp: z.string(), logoutAt: z.string().optional(),
  durationSeconds: z.number().nonnegative().optional(), role: roleSchema,
  displayName: z.string(), username: z.string(),
}).strict();
const changeSchema = z.object({
  id: z.string(), timestamp: z.string(), actorRole: roleSchema,
  actorName: z.string(), cameraId: z.string(), cameraName: z.string(),
  assetCode: z.string(), changes: z.array(z.object({
    field: z.string(), label: z.string(), before: z.string(), after: z.string(),
  }).strict()),
}).strict();
const accessResponseSchema = z.object({ accessSessions: z.array(accessSchema) }).strict();
const changesResponseSchema = z.object({ cameraChanges: z.array(changeSchema) }).strict();

async function requestJson(url: string): Promise<unknown> {
  const response = await fetch(url, { credentials: 'include' });
  let value: unknown = null;
  try { value = await response.json(); } catch { /* respuesta inválida */ }
  if (!response.ok) {
    const message = value && typeof value === 'object'
      ? (value as { message?: unknown }).message : null;
    throw new Error(typeof message === 'string' ? message : 'No fue posible cargar la auditoría.');
  }
  return value;
}

export async function getAuditFromApi(): Promise<AuditHistory> {
  const [accessValue, changesValue] = await Promise.all([
    requestJson('/api/audit/access-sessions'),
    requestJson('/api/audit/camera-changes'),
  ]);
  const access = accessResponseSchema.safeParse(accessValue);
  const changes = changesResponseSchema.safeParse(changesValue);
  if (!access.success || !changes.success) {
    throw new Error('La API devolvió un historial de auditoría no válido.');
  }
  return {
    accessHistory: access.data.accessSessions,
    changeHistory: changes.data.cameraChanges,
  };
}
