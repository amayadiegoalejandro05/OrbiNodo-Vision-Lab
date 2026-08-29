import type { DemoRole } from '../auth/demo-auth';

export interface AccessAuditEntry {
  id: string;
  timestamp: string;
  endedAt?: string;
  logoutAt?: string;
  durationSeconds?: number;
  status: 'active' | 'logged_out' | 'expired' | 'revoked';
  role: DemoRole;
  displayName: string;
  username: string;
}

export interface CameraChangeAuditEntry {
  id: string;
  timestamp: string;
  actorRole: DemoRole;
  actorName: string;
  cameraId: string;
  cameraName: string;
  assetCode: string;
  changes: Array<{
    field: string;
    label: string;
    before: string;
    after: string;
  }>;
}

export interface AuditHistory {
  accessHistory: AccessAuditEntry[];
  changeHistory: CameraChangeAuditEntry[];
}
