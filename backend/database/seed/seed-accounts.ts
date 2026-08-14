import { z } from 'zod';
import { loadBackendEnvironment } from '../../config/environment';

// Diez caracteres es la decisión explícita para esta demo local. La política debe
// endurecerse antes de exponer la API o utilizar cuentas empresariales reales.
const password = z.string().min(10).max(128);
const seedPasswordSchema = z.object({
  ORBINODO_SEED_PROGRAMMER_PASSWORD: password,
  ORBINODO_SEED_MANAGER_PASSWORD: password,
  ORBINODO_SEED_ENGINEER1_PASSWORD: password,
  ORBINODO_SEED_ENGINEER2_PASSWORD: password,
});

export type SeedRole = 'programmer' | 'manager' | 'engineer1' | 'engineer2';

export interface SeedAccount {
  username: string;
  displayName: string;
  role: SeedRole;
  password: string;
}

export function loadSeedAccounts(): SeedAccount[] {
  loadBackendEnvironment();
  const parsed = seedPasswordSchema.safeParse(process.env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error('Contraseñas de seed incompletas: ' + names);
  }
  return [
    {
      username: 'Orbinodo', displayName: 'Orbinodo', role: 'programmer',
      password: parsed.data.ORBINODO_SEED_PROGRAMMER_PASSWORD,
    },
    {
      username: 'Jefe', displayName: 'Jefe', role: 'manager',
      password: parsed.data.ORBINODO_SEED_MANAGER_PASSWORD,
    },
    {
      username: 'Ingeniero 1', displayName: 'Ingeniero 1', role: 'engineer1',
      password: parsed.data.ORBINODO_SEED_ENGINEER1_PASSWORD,
    },
    {
      username: 'Ingeniero 2', displayName: 'Ingeniero 2', role: 'engineer2',
      password: parsed.data.ORBINODO_SEED_ENGINEER2_PASSWORD,
    },
  ];
}
