import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const manualPath = resolve(root, 'documentacion/manual_instalacion_orbinodo_enterprise_v1.txt');
const manual = readFileSync(manualPath, 'utf8');

function assertCondition(condition, message) {
  if (!condition) throw new Error(`Manual de instalacion invalido: ${message}`);
}

for (const requiredText of [
  '24.18.1',
  'npm ci',
  'Copy-Item .env.example .env.backend.local',
  'orbinodo_demo',
  'orbinodo_api',
  'CREATE ROLE',
  'CREATE DATABASE',
  'npm run db:check',
  'npm run db:migrate',
  'npm run db:seed',
  'npm run build',
  'npm run api:dev',
  'npm run dev',
  'npm run verify:reproducible',
  'npm run test:integration',
  'npm run db:preflight',
  'npm run verify:production',
  'PROBLEMAS COMUNES',
  'Air Products',
]) {
  assertCondition(manual.includes(requiredText), `falta instruccion: ${requiredText}`);
}

for (const reference of [
  'documentacion/arquitectura_orbinodo_enterprise_v1.txt',
  'documentacion/contrato_api_fastify_v1.txt',
  'documentacion/modelo_datos_y_migraciones.txt',
  'documentacion/gestion_secretos_y_rotacion_v1.txt',
  'documentacion/backup_y_restauracion_postgresql_v1.txt',
  'documentacion/despliegue_reproducible_v1.txt',
  'documentacion/dossier_comercial_orbinodo_enterprise_v1.txt',
]) {
  assertCondition(readFileSync(resolve(root, reference), 'utf8').length > 0, `referencia ausente o vacia: ${reference}`);
}

assertCondition(!manual.includes('USUARIO_REAL'), 'contiene una credencial real');
assertCondition(!manual.includes('PON_AQUI_LA_CONTRASENA_REAL'), 'contiene un marcador de secreto inadecuado');
console.log('Manual de instalacion verificado: prerrequisitos, PostgreSQL, entorno, build, arranque, troubleshooting y referencias completas.');