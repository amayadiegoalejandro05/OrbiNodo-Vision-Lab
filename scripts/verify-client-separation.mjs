import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');


function sourceFiles(relativePath) {
  const directory = resolve(root, relativePath);
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = relativePath + '/' + entry.name;
    return entry.isDirectory() ? sourceFiles(child) : [child];
  }).filter((relative) => /\.(?:ts|html)$/.test(relative));
}

function required(relativePath) {
  const path = resolve(root, relativePath);
  if (!existsSync(path)) throw new Error('Falta: ' + relativePath);
  return readFileSync(path, 'utf8');
}

function assertCondition(condition, message) {
  if (!condition) throw new Error('Separacion Core/cliente invalida: ' + message);
}

const guide = required('documentacion/separacion_core_cliente_v1.txt');
const seedRunner = required('backend/database/seed/seed-runner.ts');
const frontend = required('src/main.ts');
const profileRegistry = required('client-config/client-profiles.ts');
const environment = required('backend/config/environment.ts');

for (const term of [
  'instancia dedicada por cliente',
  'Una base por cliente',
  'ORBINODO_CLIENT_PROFILE',
  'VITE_ORBINODO_CLIENT_PROFILE',
  'CREAR CLIENTE B',
]) {
  assertCondition(guide.includes(term), 'la guia no documenta ' + term);
}

const forbiddenCustomerReference = sourceFiles('src').concat(sourceFiles('backend'), sourceFiles('api'), ['index.html']).find((relative) => required(relative).match(/air products|airproducts/i));
assertCondition(!forbiddenCustomerReference, 'hay una referencia de cliente en codigo ejecutable: ' + forbiddenCustomerReference);
assertCondition(!seedRunner.includes('/src/data/'), 'el seed depende de datos dentro de src');
assertCondition(seedRunner.includes('getClientProfile'), 'el seed no usa un perfil de cliente');
assertCondition(frontend.includes('activeClientProfile'), 'el frontend no selecciona perfil');
assertCondition(profileRegistry.includes('orbinodoDemoProfile'), 'no existe perfil inicial');
assertCondition(environment.includes('ORBINODO_CLIENT_PROFILE'), 'falta variable de perfil backend');

console.log('Separacion Core/cliente verificada: perfil, seed, frontend y guia por instancia dedicada.');
