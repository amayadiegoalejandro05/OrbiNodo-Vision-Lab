import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const strict = process.argv.includes('--strict');

async function readJson(relativePath) {
  return JSON.parse(await readFile(resolve(root, relativePath), 'utf8'));
}

function fail(message) {
  throw new Error('Release invalido: ' + message);
}

function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

const packageJson = await readJson('package.json');
const lockJson = await readJson('package-lock.json');
const openapi = await readJson('documentacion/openapi/orbinodo-api-v1.json');
const manifest = await readJson('documentacion/release-manifest-v1.0.0.json');
const version = packageJson.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) fail('package.json no usa SemVer.');
if (version !== '1.0.0') fail('la release esperada es 1.0.0, no ' + version + '.');
if (lockJson.version !== version || lockJson.packages?.['']?.version !== version) {
  fail('package-lock.json no coincide con package.json.');
}
if (openapi.info?.version !== version) fail('OpenAPI no coincide con la versi?n.');
if (manifest.releaseVersion !== version || manifest.tag !== 'v' + version) {
  fail('el manifiesto no coincide con la versi?n can?nica.');
}
const pinnedNode = (await readFile(resolve(root, '.nvmrc'), 'utf8')).trim().replace(/^v/, '');
if (manifest.runtime?.node !== pinnedNode) fail('runtime Node no coincide con .nvmrc.');

const expectedMigrations = manifest.database?.migrations;
if (!Array.isArray(expectedMigrations) || expectedMigrations.length !== 8) {
  fail('el manifiesto debe relacionar las ocho migraciones.');
}
for (const migration of expectedMigrations) {
  if (!existsSync(resolve(root, 'backend/database/migrations', migration))) {
    fail('falta la migraci?n ' + migration + '.');
  }
}
for (const documentation of manifest.documentation ?? []) {
  if (!existsSync(resolve(root, documentation))) fail('falta documentaci?n: ' + documentation + '.');
}

const head = git(['rev-parse', 'HEAD']);
const taggedCommit = git(['rev-list', '-n', '1', 'v' + version]);
const dirty = git(['status', '--porcelain']);
const pendingCommit = manifest.commit?.sha === 'PENDING_TAG_COMMIT';
const pendingDeployment = manifest.deployment?.id === 'PENDING_DEPLOYMENT_ID';

if (strict) {
  if (dirty) fail('el working tree tiene cambios sin confirmar.');
  if (!head || !taggedCommit) fail('no existe el tag v' + version + '.');
  if (head !== taggedCommit) fail('el tag no apunta al commit actual.');
  if (manifest.commit?.sha !== head) fail('el SHA del manifiesto no coincide con HEAD.');
  if (pendingDeployment) fail('falta registrar el deployment productivo.');
  if (manifest.status !== 'released') fail('el manifiesto a?n no est? marcado como released.');
  console.log(`Release v${version} validada: tag ${taggedCommit}, deployment registrado.`);
} else {
  console.log(`Metadatos de release v${version} validos: package, lockfile, OpenAPI, ${expectedMigrations.length} migraciones y documentaci?n.`);
  if (pendingCommit || pendingDeployment || !taggedCommit) {
    console.log('Release en preparacion: falta completar commit/tag y deployment para la validacion estricta.');
  }
}
