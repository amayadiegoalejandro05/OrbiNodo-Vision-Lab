import type { AuthUser } from './auth-service';

export type CameraStatus = 'Operativa' | 'En mantenimiento' | 'Fuera de servicio';

export interface CameraOperationsUpdate {
  status: CameraStatus;
  lastMaintenanceOn: string;
  nextMaintenanceOn: string;
  responsibleArea: string;
  notes: string;
}

export interface CameraRecord extends CameraOperationsUpdate {
  id: string;
  assetCode: string;
  name: string;
  panoramaId: string;
  location: string;
  brand: string;
  model: string;
  type: '360°' | 'Fija';
  yaw: number;
  pitch: number;
  installedOn: string;
  coverage: string;
  recordingMode: string;
  retention: string;
}

export interface CameraUpdateResult {
  camera: CameraRecord;
  changedFields: Array<keyof CameraOperationsUpdate>;
}

export interface CameraService {
  listCameras(): Promise<CameraRecord[]>;
  updateOperations(
    cameraId: string,
    actor: AuthUser,
    update: CameraOperationsUpdate,
  ): Promise<CameraUpdateResult | null>;
}

export class CameraActorNotAllowedError extends Error {}
