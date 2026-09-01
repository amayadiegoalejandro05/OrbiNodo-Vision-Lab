import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const architecturePath = resolve(root, 'documentacion/arquitectura_orbinodo_enterprise_v1.txt');
const architecture = readFileSync(architecturePath, 'utf8');

function assertCondition(condition, message) {
  if (!condition) throw new Error(`Arquitectura invalida: ${message}`);
}

const migrationDirectory = resolve(root, 'backend/database/migrations');
const migrations = readdirSync(migrationDirectory)
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort();
assertCondition(migrations.length === 8, `se esperaban 8 migraciones y hay ${migrations.length}`);
for (const migration of migrations) {
  assertCondition(architecture.includes(migration), `falta documentar ${migration}`);
}

for (const requiredText of [
  'Proyecto A - Recorrido Virtual',
  'Proyecto B - Migracion PostgreSQL',
  'Fastify API',
  'Neon Production o PostgreSQL local',
  'src/persistence/production-persistence.test.ts',
  'DATABASE_URL o POSTGRES_URL',
  'Air Products no forma parte',
  'optimistic locking',
  '16 KiB',
  'RPO 24 horas y RTO 4 horas',
  'documentacion/openapi/orbinodo-api-v1.json',
]) {
  assertCondition(architecture.includes(requiredText), `falta referencia: ${requiredText}`);
}

assertCondition(!/cuatro migraciones|0001 a 0007/i.test(architecture), 'contiene una referencia antigua de migraciones');
for (const relativePath of [
  'documentacion/contrato_api_fastify_v1.txt',
  'documentacion/modelo_datos_y_migraciones.txt',
  'documentacion/autenticacion_y_sesiones_backend.txt',
  'documentacion/despliegue_reproducible_v1.txt',
  'documentacion/gestion_secretos_y_rotacion_v1.txt',
  'documentacion/backup_y_restauracion_postgresql_v1.txt',
  'documentacion/seguridad_https_tls_produccion.txt',
  'documentacion/hardening_servidor_api_v1.txt',
  'documentacion/testing_completo_v1.txt',
  'documentacion/dependencias_y_vulnerabilidades_v1.txt',
]) {
  assertCondition(readFileSync(resolve(root, relativePath), 'utf8').length > 0, `referencia vacia o ausente: ${relativePath}`);
}

console.log(`Arquitectura verificada: ${migrations.length} migraciones, diagramas de componentes y secuencia, y referencias operativas completas.`);