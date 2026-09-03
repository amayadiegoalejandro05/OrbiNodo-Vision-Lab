import { z } from 'zod';
import { getClientProfile } from '../../../client-config/client-profiles';

// Diez caracteres es la decision explicita para cuentas de seed. Cada instancia
// debe proporcionar sus propias contrasenas fuera del repositorio.
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

export function loadSeedAccounts(profileId: string): SeedAccount[] {
  const parsed = seedPasswordSchema.safeParse(process.env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error('Contrasenas de seed incompletas: ' + names);
  }
  const identities = getClientProfile(profileId).seedIdentities;
  return [
    {
      ...identities.programmer, role: 'programmer',
      password: parsed.data.ORBINODO_SEED_PROGRAMMER_PASSWORD,
    },
    {
      ...identities.manager, role: 'manager',
      password: parsed.data.ORBINODO_SEED_MANAGER_PASSWORD,
    },
    {
      ...identities.engineer1, role: 'engineer1',
      password: parsed.data.ORBINODO_SEED_ENGINEER1_PASSWORD,
    },
    {
      ...identities.engineer2, role: 'engineer2',
      password: parsed.data.ORBINODO_SEED_ENGINEER2_PASSWORD,
    },
  ];
}
