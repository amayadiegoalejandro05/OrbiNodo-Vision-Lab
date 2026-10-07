import type { ClientProfile } from '../../types';
import { visionLabCameras } from './cameras';
import { visionLabTour } from './tour';

export const visionLabProfile: ClientProfile = {
  id: 'vision-lab',
  deploymentModel: 'dedicated-instance',
  branding: {
    productName: 'OrbiNodo Vision Lab',
    loginEyebrow: 'Isolated experimental environment',
    loginTitle: 'Acceso a Vision Lab',
    loginDescription: 'Ingresa para supervisar el sistema de percepción experimental.',
    loginAction: 'Entrar a Vision Lab',
    loginNotice: 'Demo experimental de Diseño Mecatrónico.',
    navigationEyebrow: 'Diseño Mecatrónico',
    footer: 'OrbiNodo Vision Lab · percepción y supervisión experimental.',
    browserTitle: 'OrbiNodo Vision Lab',
  },
  tour: visionLabTour,
  cameras: visionLabCameras,
  roleLabels: {
    programmer: 'Vision Admin',
    manager: 'Vision Supervisor',
    engineer1: 'Vision Operator 1',
    engineer2: 'Vision Operator 2',
  },
  seedIdentities: {
    programmer: { username: 'vision-admin', displayName: 'Vision Admin' },
    manager: { username: 'vision-supervisor', displayName: 'Vision Supervisor' },
    engineer1: { username: 'vision-operator-1', displayName: 'Vision Operator 1' },
    engineer2: { username: 'vision-operator-2', displayName: 'Vision Operator 2' },
  },
};
