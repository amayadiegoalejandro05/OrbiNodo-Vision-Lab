import type { SecurityCameraRecord } from '../src/domain/security-camera.types';
import type { TourConfig } from '../src/domain/tour.types';

export type ClientRole = 'programmer' | 'manager' | 'engineer1' | 'engineer2';

export interface ClientBranding {
  productName: string;
  loginEyebrow: string;
  loginTitle: string;
  loginDescription: string;
  loginAction: string;
  loginNotice: string;
  navigationEyebrow: string;
  footer: string;
  browserTitle: string;
}

export interface ClientSeedIdentity {
  username: string;
  displayName: string;
}

export interface ClientProfile {
  id: string;
  deploymentModel: 'dedicated-instance';
  branding: ClientBranding;
  tour: TourConfig;
  cameras: SecurityCameraRecord[];
  roleLabels: Record<ClientRole, string>;
  seedIdentities: Record<ClientRole, ClientSeedIdentity>;
}
