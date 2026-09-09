import type { SecurityCameraRecord } from '../../../src/domain/security-camera.types';

// "Fija" describes this stage's stationary virtual position. The schema has no
// representation for robot movement, pose, or telemetry.
export const visionLabCameras: SecurityCameraRecord[] = [{
  id: 'camera-01',
  version: 0,
  assetCode: 'CAM-ROBOT-01',
  name: 'Robot Camera 01',
  panoramaId: 'vision-lab-placeholder-01',
  location: 'Vision Lab / Robot Simulation',
  brand: 'Vision Lab',
  model: 'Robot Camera Simulation',
  type: 'Fija',
  yaw: 0,
  pitch: 0,
  status: 'Operativa',
  installedOn: '2026-09-04',
  lastMaintenanceOn: '2026-09-04',
  nextMaintenanceOn: '2026-12-04',
  coverage: 'Stationary technical simulation scene.',
  recordingMode: 'No physical capture in this stage.',
  retention: 'Not applicable; simulation asset.',
  responsibleArea: 'Vision Lab',
  notes: 'Initial Vision Lab asset. It does not represent movement or live video.',
}];
