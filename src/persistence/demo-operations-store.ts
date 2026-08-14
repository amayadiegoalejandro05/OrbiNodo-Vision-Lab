import type { DemoSession } from '../auth/demo-auth';
import { demoSecurityCameras } from '../data/demo-cameras';
import type { SecurityCameraRecord } from '../domain/security-camera.types';

const CAMERA_OVERRIDES_KEY = 'orbinodo-demo-camera-overrides';
const ACCESS_HISTORY_KEY = 'orbinodo-demo-access-history';
const CHANGE_HISTORY_KEY = 'orbinodo-demo-change-history';
const CURRENT_ACCESS_ID_KEY = 'orbinodo-demo-current-access-id';
const MAX_HISTORY_ENTRIES = 200;

export type EditableCameraField =
  | 'status'
  | 'lastMaintenanceOn'
  | 'nextMaintenanceOn'
  | 'responsibleArea'
  | 'notes';

export type CameraOperationalUpdate = Pick<SecurityCameraRecord, EditableCameraField>;

export interface FieldChange {
  field: EditableCameraField;
  label: string;
  before: string;
  after: string;
}

export interface CameraChangeHistoryEntry {
  id: string;
  timestamp: string;
  actorRole: DemoSession['role'];
  actorName: string;
  cameraId: string;
  cameraName: string;
  assetCode: string;
  changes: FieldChange[];
}

export interface AccessHistoryEntry {
  id: string;
  timestamp: string;
  logoutAt?: string;
  durationSeconds?: number;
  role: DemoSession['role'];
  displayName: string;
  username: string;
}

interface StoredOverrides {
  [cameraId: string]: CameraOperationalUpdate;
}

const FIELD_LABELS: Record<EditableCameraField, string> = {
  status: 'Estado operativo',
  lastMaintenanceOn: 'Último mantenimiento',
  nextMaintenanceOn: 'Próximo mantenimiento',
  responsibleArea: 'Área responsable',
  notes: 'Observaciones',
};

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; }
  catch { return fallback; }
}

function createId(now: Date): string {
  return now.getTime() + '-' + Math.random().toString(36).slice(2, 10);
}

function cleanText(value: string, maxLength: number): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function cleanDate(value: string, fieldName: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value + 'T00:00:00Z'))) {
    throw new Error(fieldName + ' debe ser una fecha válida.');
  }
  return value;
}

function normalizeUpdate(update: CameraOperationalUpdate): CameraOperationalUpdate {
  if (!['Operativa', 'En mantenimiento', 'Fuera de servicio'].includes(update.status)) {
    throw new Error('El estado operativo no es válido.');
  }
  const normalized: CameraOperationalUpdate = {
    status: update.status,
    lastMaintenanceOn: cleanDate(update.lastMaintenanceOn, 'Último mantenimiento'),
    nextMaintenanceOn: cleanDate(update.nextMaintenanceOn, 'Próximo mantenimiento'),
    responsibleArea: cleanText(update.responsibleArea, 100),
    notes: cleanText(update.notes, 500),
  };
  if (!normalized.responsibleArea) throw new Error('El área responsable es obligatoria.');
  if (!normalized.notes) throw new Error('Las observaciones son obligatorias.');
  if (normalized.nextMaintenanceOn < normalized.lastMaintenanceOn) {
    throw new Error('El próximo mantenimiento no puede ser anterior al último mantenimiento.');
  }
  return normalized;
}

function readOverrides(storage: Storage): StoredOverrides {
  return safeParse<StoredOverrides>(storage.getItem(CAMERA_OVERRIDES_KEY), {});
}

function readHistory<T>(storage: Storage, key: string): T[] {
  return safeParse<T[]>(storage.getItem(key), []);
}

function writeHistory<T>(storage: Storage, key: string, history: T[]): void {
  storage.setItem(key, JSON.stringify(history.slice(0, MAX_HISTORY_ENTRIES)));
}

function appendHistory<T>(storage: Storage, key: string, entry: T): void {
  writeHistory(storage, key, [entry, ...readHistory<T>(storage, key)]);
}

export function getCameraRecords(storage: Storage = localStorage): SecurityCameraRecord[] {
  const overrides = readOverrides(storage);
  return demoSecurityCameras.map((camera) => ({ ...camera, ...overrides[camera.id] }));
}

// El identificador de la sesión se guarda en sessionStorage. Así una recarga no
// crea un acceso duplicado y el botón Cerrar sesión puede calcular la duración.
export function recordSuccessfulLogin(
  session: DemoSession,
  storage: Storage = localStorage,
  sessionStore: Storage = sessionStorage,
  now: Date = new Date(),
): AccessHistoryEntry {
  const entry: AccessHistoryEntry = {
    id: createId(now),
    timestamp: now.toISOString(),
    role: session.role,
    displayName: session.displayName,
    username: session.username,
  };
  appendHistory(storage, ACCESS_HISTORY_KEY, entry);
  sessionStore.setItem(CURRENT_ACCESS_ID_KEY, entry.id);
  return entry;
}

// Solo un cierre explícito permite medir una duración confiable en esta demo
// local. Cerrar la pestaña deja la sesión marcada como "sin cierre registrado".
export function recordSuccessfulLogout(
  storage: Storage = localStorage,
  sessionStore: Storage = sessionStorage,
  now: Date = new Date(),
): AccessHistoryEntry | null {
  const currentId = sessionStore.getItem(CURRENT_ACCESS_ID_KEY);
  if (!currentId) return null;
  const history = readHistory<AccessHistoryEntry>(storage, ACCESS_HISTORY_KEY);
  const index = history.findIndex((entry) => entry.id === currentId);
  sessionStore.removeItem(CURRENT_ACCESS_ID_KEY);
  if (index < 0) return null;
  const entry = history[index]!;
  const durationSeconds = Math.max(0, Math.floor((now.getTime() - new Date(entry.timestamp).getTime()) / 1000));
  const completed: AccessHistoryEntry = {
    ...entry,
    logoutAt: now.toISOString(),
    durationSeconds,
  };
  history[index] = completed;
  writeHistory(storage, ACCESS_HISTORY_KEY, history);
  return completed;
}

export function saveCameraOperationalUpdate(
  cameraId: string,
  update: CameraOperationalUpdate,
  actor: DemoSession,
  storage: Storage = localStorage,
): { camera: SecurityCameraRecord; historyEntry: CameraChangeHistoryEntry | null } {
  if (actor.role !== 'engineer1' && actor.role !== 'engineer2') {
    throw new Error('Este perfil no puede editar información operativa.');
  }
  const current = getCameraRecords(storage).find((camera) => camera.id === cameraId);
  if (!current) throw new Error('La cámara seleccionada no existe.');
  const normalized = normalizeUpdate(update);
  const fields = Object.keys(FIELD_LABELS) as EditableCameraField[];
  const changes = fields
    .filter((field) => current[field] !== normalized[field])
    .map((field) => ({
      field,
      label: FIELD_LABELS[field],
      before: current[field],
      after: normalized[field],
    }));
  if (changes.length === 0) return { camera: current, historyEntry: null };

  const overrides = readOverrides(storage);
  overrides[cameraId] = normalized;
  storage.setItem(CAMERA_OVERRIDES_KEY, JSON.stringify(overrides));
  const camera = { ...current, ...normalized };
  const historyEntry: CameraChangeHistoryEntry = {
    id: createId(new Date()),
    timestamp: new Date().toISOString(),
    actorRole: actor.role,
    actorName: actor.displayName,
    cameraId,
    cameraName: current.name,
    assetCode: current.assetCode,
    changes,
  };
  appendHistory(storage, CHANGE_HISTORY_KEY, historyEntry);
  return { camera, historyEntry };
}

export function getAccessHistory(storage: Storage = localStorage): AccessHistoryEntry[] {
  return readHistory<AccessHistoryEntry>(storage, ACCESS_HISTORY_KEY);
}

export function getChangeHistory(storage: Storage = localStorage): CameraChangeHistoryEntry[] {
  return readHistory<CameraChangeHistoryEntry>(storage, CHANGE_HISTORY_KEY);
}
