import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const projectRoot = resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8'));
const lockfile = JSON.parse(readFileSync(resolve(projectRoot, 'package-lock.json'), 'utf8'));
const allowedDirectLicenses = new Set(['MIT', 'BSD-2-Clause', 'Apache-2.0', 'ISC']);
const directPackages = { ...packageJson.dependencies, ...packageJson.devDependencies };

if (lockfile.lockfileVersion !== 3) {
  throw new Error('package-lock.json debe usar lockfileVersion 3.');
}

for (const packageName of Object.keys(directPackages)) {
  const lockEntry = lockfile.packages?.[`node_modules/${packageName}`];
  if (!lockEntry?.version || !lockEntry?.integrity) {
    throw new Error(`Falta version o integridad bloqueada para ${packageName}.`);
  }

  const installedPackage = JSON.parse(readFileSync(
    resolve(projectRoot, 'node_modules', packageName, 'package.json'),
    'utf8',
  ));
  if (!allowedDirectLicenses.has(installedPackage.license)) {
    throw new Error(`Licencia directa no aprobada para ${packageName}: ${installedPackage.license ?? 'sin declarar'}.`);
  }
}

for (const packageName of Object.keys(packageJson.dependencies)) {
  if (packageJson.devDependencies?.[packageName]) {
    throw new Error(`${packageName} no puede estar a la vez en dependencies y devDependencies.`);
  }
}

const auditCommand = process.platform === 'win32'
  ? { command: process.env.ComSpec ?? 'cmd.exe', args: ['/d', '/s', '/c', 'npm audit --omit=dev --json'] }
  : { command: 'npm', args: ['audit', '--omit=dev', '--json'] };
const audit = spawnSync(auditCommand.command, auditCommand.args, {
  cwd: projectRoot,
  encoding: 'utf8',
});

if (audit.error) throw audit.error;

let auditReport;
try {
  auditReport = JSON.parse(audit.stdout);
} catch {
  throw new Error('npm audit no devolvio un informe JSON valido.');
}

const vulnerabilities = auditReport.metadata?.vulnerabilities;
if (!vulnerabilities || vulnerabilities.total !== 0) {
  throw new Error(`Dependencias de produccion vulnerables: ${vulnerabilities?.total ?? 'resultado desconocido'}.`);
}

console.log(`Dependencias verificadas: ${Object.keys(packageJson.dependencies).length} de produccion y ${Object.keys(packageJson.devDependencies).length} de desarrollo.`);
console.log('Lockfile, licencias directas y auditoria de produccion: correctos.');
