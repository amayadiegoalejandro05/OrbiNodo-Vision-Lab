import type { DemoRole } from './demo-auth';

export interface RolePermissions {
  calibrator: boolean;
  cameraMap: boolean;
  editCameraOperations: boolean;
  viewAuditHistory: boolean;
}

// La matriz central evita repartir decisiones de permisos en distintos botones.
// Sigue siendo control visual de demo; un backend deberá repetir estas reglas.
export const ROLE_PERMISSIONS: Record<DemoRole, RolePermissions> = {
  programmer: {
    calibrator: true,
    cameraMap: true,
    editCameraOperations: false,
    viewAuditHistory: false,
  },
  manager: {
    calibrator: false,
    cameraMap: true,
    editCameraOperations: false,
    viewAuditHistory: true,
  },
  engineer1: {
    calibrator: false,
    cameraMap: true,
    editCameraOperations: true,
    viewAuditHistory: false,
  },
  engineer2: {
    calibrator: false,
    cameraMap: true,
    editCameraOperations: true,
    viewAuditHistory: false,
  },
};

export function getRolePermissions(role: DemoRole): RolePermissions {
  return ROLE_PERMISSIONS[role];
}
