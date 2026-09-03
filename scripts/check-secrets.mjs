import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const allowedEnvFiles = new Set(['.env.example']);
const scannerFile = 'scripts/check-secrets.mjs';
const findings = [];

function git(args, allowNoMatch = false) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (error) {
    if (allowNoMatch && error && typeof error === 'object' && error.status === 1) return '';
    throw error;
  }
}

function inspect(file, content) {
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) {
    findings.push(file + ': private key');
  }
  if (/\bnpg_[A-Za-z0-9_-]{12,}\b/.test(content)) findings.push(file + ': Neon password');
  if (/\bvercel_[A-Za-z0-9_-]{20,}\b/.test(content)) findings.push(file + ': Vercel token');
  for (const url of content.match(/postgres(?:ql)?:\/\/[^\s'"`]+/g) ?? []) {
    const placeholder = /usuario:clave@(?:host|db\.example)|\[REDACTED\]|PEGA_AQUI/.test(url);
    const safeExample = url.includes('usuario:secreto@db.interna')
      || url.includes('USUARIO_LOCAL:CLAVE_LOCAL@127.0.0.1');
    if (!placeholder && !safeExample) {
      findings.push(file + ': PostgreSQL URL');
      break;
    }
  }
}

for (const file of git(['ls-files']).trim().split(/\r?\n/).filter(Boolean)) {
  if (file === scannerFile) continue;
  // A tracked file may have been intentionally deleted but not committed yet.
  // It is absent from the handoff working tree and must not make the scanner fail.
  if (!existsSync(resolve(root, file))) continue;
  if (/(^|\/)\.env/.test(file) && !allowedEnvFiles.has(file)) {
    findings.push(file + ': archivo .env rastreado');
    continue;
  }
  inspect(file, readFileSync(resolve(root, file), 'utf8'));
}

const historyPattern = 'npg_|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|vercel_[A-Za-z0-9_-]{20,}';
for (const commit of git(['rev-list', '--all']).trim().split(/\r?\n/).filter(Boolean)) {
  const files = git(['grep', '-l', '-I', '-E', historyPattern, commit, '--'], true)
    .trim().split(/\r?\n/).filter(Boolean);
  for (const hit of files) {
    const separator = hit.indexOf(':');
    const file = separator >= 0 ? hit.slice(separator + 1) : hit;
    if (file !== scannerFile) findings.push('historial ' + commit.slice(0, 7) + ': ' + file);
  }
}

if (findings.length > 0) {
  console.error('Secrets check failed. Rutas detectadas:');
  for (const finding of [...new Set(findings)]) console.error('- ' + finding);
  process.exitCode = 1;
} else {
  console.log('Secrets check correcto: no hay secretos de alta se?al en archivos rastreados ni historial Git.');
}
