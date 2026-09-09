import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';

const ENV_FILE = resolve('.env.vision-lab.local');
const accounts = {
  programmer: { username: 'vision-admin', displayName: 'Vision Admin', role: 'programmer', passwordName: 'ORBINODO_SEED_PROGRAMMER_PASSWORD' },
  manager: { username: 'vision-supervisor', displayName: 'Vision Supervisor', role: 'manager', passwordName: 'ORBINODO_SEED_MANAGER_PASSWORD' },
  engineer1: { username: 'vision-operator-1', displayName: 'Vision Operator 1', role: 'engineer1', passwordName: 'ORBINODO_SEED_ENGINEER1_PASSWORD' },
  engineer2: { username: 'vision-operator-2', displayName: 'Vision Operator 2', role: 'engineer2', passwordName: 'ORBINODO_SEED_ENGINEER2_PASSWORD' },
};

export function loadVisionLabVerificationConfig() {
  if (!existsSync(ENV_FILE)) throw new Error('Falta .env.vision-lab.local.');
  const environment = parse(readFileSync(ENV_FILE, 'utf8'));
  const databaseUrl = environment.DATABASE_URL ?? environment.POSTGRES_URL;
  if (environment.APP_ENV !== 'vision-lab') throw new Error('APP_ENV debe ser vision-lab.');
  if (environment.ORBINODO_CLIENT_PROFILE !== 'vision-lab') {
    throw new Error('ORBINODO_CLIENT_PROFILE debe ser vision-lab.');
  }
  if (!databaseUrl || !environment.VISION_LAB_DATABASE_HOST) {
    throw new Error('Falta la configuracion aislada de Vision Lab.');
  }
  const host = new URL(databaseUrl).hostname.toLowerCase();
  if (host !== environment.VISION_LAB_DATABASE_HOST.toLowerCase()) {
    throw new Error('El host de Neon no coincide con Vision Lab.');
  }
  const resolvedAccounts = Object.fromEntries(Object.entries(accounts).map(([key, account]) => {
    const password = environment[account.passwordName];
    if (!password) throw new Error('Falta ' + account.passwordName + '.');
    return [key, { ...account, password }];
  }));
  return {
    environment: { ...environment, DATABASE_URL: databaseUrl, VITE_ORBINODO_CLIENT_PROFILE: 'vision-lab' },
    accounts: resolvedAccounts,
    camera: { id: 'camera-01', assetCode: 'CAM-ROBOT-01', name: 'Robot Camera 01' },
  };
}
