import { loadBackendEnvironment } from '../config/environment';
import { loadSeedAccounts } from './seed/seed-accounts';
import { runSeed } from './seed/seed-runner';

async function seed(): Promise<void> {
  const result = await runSeed(loadBackendEnvironment(), loadSeedAccounts());
  console.log(`Seed completado: ${result.users} usuarios y ${result.cameras} cámaras.`);
}

seed().catch((error: unknown) => {
  // Solo SQLSTATE es seguro para diagnóstico: no contiene consultas ni valores.
  const code = typeof error === 'object' && error !== null && 'code' in error
    && typeof error.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)
    ? error.code
    : undefined;
  const category = error instanceof Error && error.message.startsWith('Contraseñas de seed')
    ? 'SEED_ENV_INVALID'
    : error instanceof Error && error.message.startsWith('Falta aplicar')
      ? 'SCHEMA_MISSING'
      : error instanceof Error && error.name === 'Error' ? 'ARGON2_OR_RUNTIME_FAILURE' : undefined;
  const suffix = code
    ? ' Código SQLSTATE: ' + code + '.'
    : category ? ' Categoría: ' + category + '.' : '';
  console.error('No fue posible aplicar el seed. Revisa el entorno y PostgreSQL.' + suffix);
  process.exitCode = 1;
});
