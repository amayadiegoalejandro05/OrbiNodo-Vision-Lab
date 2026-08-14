import type { AuthRole } from './auth-service';

export interface AccessAuditEntry {
  id: string;
  timestamp: string;
  logoutAt?: string;
  durationSeconds?: number;
  role: AuthRole;
  displayName: string;
  username: string;
}

export interface AuditFieldChange {
  field: 'status' | 'lastMaintenanceOn' | 'nextMaintenanceOn' | 'responsibleArea' | 'notes';
  label: string;
  before: string;
  after: string;
}

export interface CameraChangeAuditEntry {
  id: string;
  timestamp: string;
  actorRole: AuthRole;
  actorName: string;
  cameraId: string;
  cameraName: string;
  assetCode: string;
  changes: AuditFieldChange[];
}

export interface AuditService {
  listAccessSessions(): Promise<AccessAuditEntry[]>;
  listCameraChanges(): Promise<CameraChangeAuditEntry[]>;
}
