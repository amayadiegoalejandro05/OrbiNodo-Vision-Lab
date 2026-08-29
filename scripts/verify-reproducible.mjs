import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const pinned = (await readFile(join(root, '.nvmrc'), 'utf8')).trim();
if (!/v?\d+\.\d+\.\d+/.test(pinned)) throw new Error('.nvmrc no contiene una version valida.');
if (process.version.replace(/^v/, '') !== pinned.replace(/^v/, '')) {
  throw new Error('Node actual ' + process.version + ' no coincide con .nvmrc (' + pinned + ').');
}
const temporary = await mkdtemp(join(tmpdir(), 'orbinodo-clean-'));
const excluded = new Set(['node_modules', 'dist', '.git', '.vercel']);
function shouldCopy(source) {
  const rel = relative(root, source);
  if (!rel) return true;
  const first = rel.split(sep)[0];
  if (excluded.has(first) || first.startsWith('.env')) return false;
  return true;
}
function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const executable = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : command;
    const commandArgs = process.platform === 'win32' ? ['/d', '/s', '/c', command, ...args] : args;
    const child = spawn(executable, commandArgs, { cwd: temporary, stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolveRun() : reject(new Error(command + ' termino con codigo ' + code + '.')));
  });
}
try {
  await cp(root, temporary, { recursive: true, filter: shouldCopy });
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  await run(npm, ['ci', '--ignore-scripts']);
  await run(npm, ['run', 'build']);
  console.log('Entorno limpio verificado: npm ci y build completados.');
} finally {
  await rm(temporary, { recursive: true, force: true });
}