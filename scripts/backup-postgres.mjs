import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { relative, resolve } from 'node:path';

const backupDir = resolve(process.env.ORBINODO_BACKUP_DIR ?? 'D:/Backups/OrbiNodo');
const dumpPath = process.env.PG_DUMP_PATH ?? 'C:/Program Files/PostgreSQL/18/bin/pg_dump.exe';
const source = process.env.DATABASE_URL;
const keyText = process.env.ORBINODO_BACKUP_ENCRYPTION_KEY;

function fail(message) { throw new Error(message); }
function isInside(parent, child) {
  const path = relative(parent, child);
  return path !== '' && !path.startsWith('..') && !path.includes(':');
}
function run(command, args, env) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { env, stdio: 'ignore', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolveRun() : reject(new Error('pg_dump termino con codigo ' + code + '.')));
  });
}

if (process.env.ORBINODO_BACKUP_SOURCE !== 'production') fail('Confirma ORBINODO_BACKUP_SOURCE=production antes de crear un respaldo.');
if (!source?.startsWith('postgres')) fail('DATABASE_URL es obligatoria.');
if (!/^[a-fA-F0-9]{64}$/.test(keyText ?? '')) fail('ORBINODO_BACKUP_ENCRYPTION_KEY debe tener 64 caracteres hexadecimales.');
if (!existsSync(dumpPath)) fail('No existe pg_dump en la ruta configurada.');

const url = new URL(source);
if (!url.hostname || !url.pathname || url.pathname === '/') fail('DATABASE_URL no identifica una base.');
await fs.mkdir(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const raw = resolve(backupDir, 'orbinodo-production-' + stamp + '.dump.tmp');
const encrypted = resolve(backupDir, 'orbinodo-production-' + stamp + '.dump.enc');
const manifest = resolve(backupDir, 'orbinodo-production-' + stamp + '.manifest.json');
if (!isInside(backupDir, raw) || !isInside(backupDir, encrypted) || !isInside(backupDir, manifest)) fail('La ruta de backup no es segura.');

const pgEnv = {
  ...process.env,
  PGHOST: url.hostname,
  PGPORT: url.port || '5432',
  PGDATABASE: url.pathname.slice(1),
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
  PGSSLMODE: url.searchParams.get('sslmode') ?? 'require',
};

try {
  await run(dumpPath, ['--format=custom', '--no-owner', '--no-privileges', '--no-password', '--file=' + raw], pgEnv);
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyText, 'hex'), iv);
  const output = createWriteStream(encrypted, { flags: 'wx' });
  output.write(Buffer.concat([Buffer.from('ORBIBK01'), iv]));
  await pipeline(createReadStream(raw), cipher, output);
  await fs.appendFile(encrypted, cipher.getAuthTag());

  const encryptedBytes = await fs.readFile(encrypted);
  const sha256 = createHash('sha256').update(encryptedBytes).digest('hex');
  const metadata = { format: 'ORBIBK01', encryptedFile: encrypted.split(/[\\\\/]/).pop(), sha256, createdAtUtc: new Date().toISOString(), source: 'production', encryption: 'AES-256-GCM' };
  await fs.writeFile(manifest, JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx' });
  const stat = await fs.stat(encrypted);
  console.log('Backup cifrado creado: ' + encrypted);
  console.log('Integridad SHA-256: ' + sha256);
  console.log('Tamano: ' + stat.size + ' bytes. Manifest: ' + manifest);
} finally {
  await fs.rm(raw, { force: true });
}