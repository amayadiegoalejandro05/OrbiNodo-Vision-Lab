import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const manual = await readFile(resolve('documentacion/manual_operacion_orbinodo_enterprise_v1.txt'), 'utf8');
const required = [
  'USUARIOS, ROLES Y SESIONES',
  'BACKUP Y RESTAURACION',
  'VERSIONES, DESPLIEGUE Y ROLLBACK',
  'LOGS Y DIAGNOSTICO',
  'INCIDENTES FRECUENTES',
  'ESCALAMIENTO TECNICO',
  'npm run verify:production',
  'npm run db:backup',
  'npm run db:restore:validate',
  'npm run sessions:close',
  'Request ID (reqId)',
];

const missing = required.filter((item) => !manual.includes(item));

if (missing.length > 0) {
  throw new Error(`El manual de operacion no cubre: ${missing.join(', ')}`);
}

console.log('Manual de operacion verificado: cubre sesiones, auditoria, backups, restore, despliegue, rollback, logs e incidentes.');
