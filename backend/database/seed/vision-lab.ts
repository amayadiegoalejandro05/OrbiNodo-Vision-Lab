import { loadBackendEnvironment } from '../../config/environment';
import { loadSeedAccounts } from './seed-accounts';
import { runSeed } from './seed-runner';

async function seedVisionLab(): Promise<void> {
  const environment = loadBackendEnvironment();
  if (environment.APP_ENV !== 'vision-lab' || environment.ORBINODO_CLIENT_PROFILE !== 'vision-lab') {
    throw new Error('El bootstrap exige APP_ENV=vision-lab y ORBINODO_CLIENT_PROFILE=vision-lab.');
  }
  const result = await runSeed(environment, loadSeedAccounts('vision-lab'));
  console.log('Bootstrap Vision Lab completado: ' + result.users + ' usuarios y ' + result.cameras + ' camara.');
}

seedVisionLab().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Error desconocido.';
  console.error('No fue posible preparar Vision Lab: ' + message);
  process.exitCode = 1;
});
