import { argon2, argon2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

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

function derivePassword(password: string, salt: Buffer, memory: number, passes: number, parallelism: number, tagLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => argon2('argon2id', {
    message: Buffer.from(password, 'utf8'), nonce: salt, parallelism,
    tagLength, memory, passes,
  }, (error, result) => error ? reject(error) : resolve(result)));
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const match = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([\w-]+)\$([\w-]+)$/.exec(encoded);
  if (!match) return false;
  const memory = Number(match[1]);
  const passes = Number(match[2]);
  const parallelism = Number(match[3]);
  const salt = Buffer.from(match[4], 'base64url');
  const expected = Buffer.from(match[5], 'base64url');
  if (memory < 8_192 || memory > 262_144 || passes < 1 || passes > 10) return false;
  if (parallelism < 1 || parallelism > 8 || salt.length < 16 || salt.length > 64) return false;
  if (expected.length < 16 || expected.length > 64) return false;
  const actual = await derivePassword(
    password, salt, memory, passes, parallelism, expected.length,
  ).catch(() => Buffer.alloc(0));
  return actual.length === expected.length
    && timingSafeEqual(actual, expected);
}
