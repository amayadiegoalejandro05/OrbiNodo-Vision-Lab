import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password-hash';

describe('contraseñas Argon2id', () => {
  it('acepta la contraseña correcta de 10 caracteres', async () => {
    const hash = hashPassword('1234567890');
    expect(await verifyPassword('1234567890', hash)).toBe(true);
    expect(await verifyPassword('0987654321', hash)).toBe(false);
  });

  it('rechaza hashes malformados sin lanzar detalles internos', async () => {
    expect(await verifyPassword('1234567890', 'hash-invalido')).toBe(false);
  });
});
