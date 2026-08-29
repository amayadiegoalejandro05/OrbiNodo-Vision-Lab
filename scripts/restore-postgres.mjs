import { createDecipheriv, createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { resolve } from 'node:path';
import pg from 'pg';

const file = process.argv[2] ? resolve(process.argv[2]) : undefined;
const targetText = process.env.ORBINODO_RESTORE_DATABASE_URL;
const keyText = process.env.ORBINODO_BACKUP_ENCRYPTION_KEY;
const restorePath = process.env.PG_RESTORE_PATH ?? 'C:/Program Files/PostgreSQL/18/bin/pg_restore.exe';
const validationDatabase = 'orbinodo_restore_validation';

function fail(message) { throw new Error(message); }
function run(command, args, env) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { env, stdio: 'ignore', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolveRun() : reject(new Error('pg_restore termino con codigo ' + code + '.')));
  });
}

if (!file || !file.endsWith('.dump.enc') || !existsSync(file)) fail('Indica un backup .dump.enc existente.');
if (!targetText?.startsWith('postgres')) fail('ORBINODO_RESTORE_DATABASE_URL es obligatoria.');
if (!/^[a-fA-F0-9]{64}$/.test(keyText ?? '')) fail('ORBINODO_BACKUP_ENCRYPTION_KEY debe tener 64 caracteres hexadecimales.');
if (!existsSync(restorePath)) fail('No existe pg_restore en la ruta configurada.');

const target = new URL(targetText);
const dbName = target.pathname.slice(1);
if (!['127.0.0.1', 'localhost', '::1'].includes(target.hostname) || dbName !== validationDatabase) fail('Restore solo permite la base local aislada orbinodo_restore_validation.');

const manifestFile = file.replace(/\.dump\.enc$/, '.manifest.json');
if (!existsSync(manifestFile)) fail('Falta el archivo manifest de integridad.');
const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
const encryptedBytes = await fs.readFile(file);
const sha256 = createHash('sha256').update(encryptedBytes).digest('hex');
if (manifest.format !== 'ORBIBK01' || manifest.sha256 !== sha256) fail('El checksum del backup no coincide con su manifest.');
if (encryptedBytes.subarray(0, 8).toString() !== 'ORBIBK01' || encryptedBytes.length < 41) fail('Formato de backup invalido.');

const admin = new URL(targetText);
admin.pathname = '/postgres';
const adminClient = new pg.Client({ connectionString: admin.toString() });
await adminClient.connect();
try {
  const existing = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [validationDatabase]);
  if (existing.rowCount) fail('La base aislada ya existe; este proceso nunca la sobrescribe.');
  await adminClient.query('CREATE DATABASE "orbinodo_restore_validation"');
} finally {
  await adminClient.end();
}

const temp = file + '.restore.tmp';
const decipher = createDecipheriv('aes-256-gcm', Buffer.from(keyText, 'hex'), encryptedBytes.subarray(8, 24));
decipher.setAuthTag(encryptedBytes.subarray(-16));
try {
  await pipeline(createReadStream(file, { start: 24, end: encryptedBytes.length - 17 }), decipher, createWriteStream(temp, { flags: 'wx' }));
  const restoreEnv = {
    ...process.env,
    PGHOST: target.hostname,
    PGPORT: target.port || '5432',
    PGDATABASE: validationDatabase,
    PGUSER: decodeURIComponent(target.username),
    PGPASSWORD: decodeURIComponent(target.password),
    PGSSLMODE: target.searchParams.get('sslmode') ?? 'disable',
  };
  await run(restorePath, ['--exit-on-error', '--no-owner', '--no-privileges', '--no-password', '--dbname=' + validationDatabase, temp], restoreEnv);

  const client = new pg.Client({ connectionString: targetText });
  await client.connect();
  try {
    const result = await client.query('SELECT (SELECT count(*) FROM schema_migrations)::int AS migrations, (SELECT count(*) FROM users)::int AS users, (SELECT count(*) FROM cameras)::int AS cameras, (SELECT count(*) FROM camera_operational_state)::int AS states');
    const values = result.rows[0];
    if (values.migrations < 7 || values.users < 4 || values.cameras < 10 || values.states < 10) fail('Integridad post-restore no superada.');
    console.log('Restore validado en ' + validationDatabase + ': ' + values.migrations + ' migraciones, ' + values.users + ' usuarios, ' + values.cameras + ' camaras y ' + values.states + ' estados.');
  } finally {
    await client.end();
  }
} finally {
  await fs.rm(temp, { force: true });
}