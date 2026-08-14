import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

for (const script of ['verify-experience.mjs', 'verify-api-auth.mjs']) {
  const result = spawnSync(process.execPath, [resolve('scripts', script)], {
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
