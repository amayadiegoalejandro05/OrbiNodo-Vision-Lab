// Inventario mínimo para representar equipos CCTV dentro de la demostración.
// yaw y pitch sirven únicamente para dibujar el punto; no se muestran en la ficha.
export type SecurityCameraType = '360°' | 'Fija';

export interface SecurityCameraRecord {
  id: string;
  assetCode: string;
  name: string;
  panoramaId: string;
  location: string;
  brand: string;
  model: string;
  type: SecurityCameraType;
  yaw: number;
  pitch: number;
  status: 'Operativa' | 'En mantenimiento' | 'Fuera de servicio';
  installedOn: string;
  lastMaintenanceOn: string;
  nextMaintenanceOn: string;
  coverage: string;
  recordingMode: string;
  retention: string;
  responsibleArea: string;
  notes: string;
}
