import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

function read(relativePath) {
  const path = resolve(root, relativePath);
  if (!existsSync(path)) throw new Error(`Falta el archivo requerido: ${relativePath}`);
  return readFileSync(path, 'utf8');
}

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

const readiness = read('documentacion/cybersecurity_readiness_v1.txt');
const risks = read('documentacion/registro_riesgos_ciberseguridad_v1.txt');
const app = read('backend/app.ts');
const authRoutes = read('backend/routes/auth-routes.ts');
const passwordHash = read('backend/security/password-hash.ts');
const packageJson = JSON.parse(read('package.json'));

for (const heading of [
  'CYBERSECURITY READINESS - ORBINODO ENTERPRISE v1',
  'R-001', 'R-002', 'R-003', 'R-004', 'R-005', 'R-006', 'R-007',
]) {
  assertCondition(readiness.includes(heading) || risks.includes(heading), `Falta evidencia documentada: ${heading}`);
}

for (const control of [
  'API_BODY_LIMIT_BYTES',
  'content-security-policy',
  'permissions-policy',
  'x-frame-options',
  'CORS_ORIGIN_FORBIDDEN',
  'HTTPS_REQUIRED',
]) {
  assertCondition(app.includes(control), `Falta el control API: ${control}`);
}

for (const control of ['httpOnly: true', "sameSite: 'lax'"]) {
  assertCondition(authRoutes.includes(control), `Falta el control de sesion: ${control}`);
}

for (const control of ['argon2id', 'MEMORY_KIB = 65_536', 'PASSES = 3']) {
  assertCondition(passwordHash.includes(control), `Falta el control de contrasena: ${control}`);
}

for (const script of ['secrets:check', 'deps:check', 'test:all']) {
  assertCondition(typeof packageJson.scripts?.[script] === 'string', `Falta el script requerido: ${script}`);
}

console.log('Cybersecurity readiness verificado: documentacion, controles API, sesion, Argon2id y scripts de seguridad.');
