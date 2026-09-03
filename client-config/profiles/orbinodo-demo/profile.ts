import { demoSecurityCameras } from './cameras';
import { demoTour } from './tour';
import type { ClientProfile } from '../../types';

export const orbinodoDemoProfile: ClientProfile = {
  id: 'orbinodo-demo',
  deploymentModel: 'dedicated-instance',
  branding: {
    productName: 'OrbiNodo',
    loginEyebrow: 'Demo de OrbiNodo',
    loginTitle: 'Acceso al recorrido virtual',
    loginDescription: 'Ingresa las credenciales asignadas para abrir la demostraci?n.',
    loginAction: 'Entrar a OrbiNodo',
    loginNotice: 'Acceso b?sico para una demo con im?genes artificiales p?blicas.',
    navigationEyebrow: 'Recorrido virtual',
    footer: 'Demo p?blica preparada para despliegue manual en Vercel.',
    browserTitle: 'Recorrido virtual de la vivienda',
  },
  tour: demoTour,
  cameras: demoSecurityCameras,
  roleLabels: {
    programmer: 'OrbiNodo',
    manager: 'Jefe de seguridad',
    engineer1: 'Ingeniero 1',
    engineer2: 'Ingeniero 2',
  },
  seedIdentities: {
    programmer: { username: 'Orbinodo', displayName: 'Orbinodo' },
    manager: { username: 'Jefe', displayName: 'Jefe' },
    engineer1: { username: 'Ingeniero 1', displayName: 'Ingeniero 1' },
    engineer2: { username: 'Ingeniero 2', displayName: 'Ingeniero 2' },
  },
};
