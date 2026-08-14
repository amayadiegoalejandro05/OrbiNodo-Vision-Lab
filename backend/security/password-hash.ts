import { argon2Sync, randomBytes } from 'node:crypto';

const MEMORY_KIB = 65_536;
const PASSES = 3;
const PARALLELISM = 1;
const TAG_LENGTH = 32;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derivedKey = argon2Sync('argon2id', {
    message: Buffer.from(password, 'utf8'),
    nonce: salt,
    parallelism: PARALLELISM,
    tagLength: TAG_LENGTH,
    memory: MEMORY_KIB,
    passes: PASSES,
  });
  const settings = `m=${MEMORY_KIB},t=${PASSES},p=${PARALLELISM}`;
  return ['', 'argon2id', 'v=19', settings, salt.toString('base64url'), derivedKey.toString('base64url')]
    .join('$');
}
