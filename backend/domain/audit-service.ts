import type { AuthRole } from './auth-service';

export interface AccessAuditEntry {
  id: string;
  timestamp: string;
  endedAt?: string;
  logoutAt?: string;
  durationSeconds?: number;
  status: 'active' | 'logged_out' | 'expired' | 'revoked';
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

export interface CameraChangeFilters {
  cameraId?: string;
  assetCode?: string;
  username?: string;
}

export interface AuditService {
  listAccessSessions(): Promise<AccessAuditEntry[]>;
  listCameraChanges(filters?: CameraChangeFilters): Promise<CameraChangeAuditEntry[]>;
}
