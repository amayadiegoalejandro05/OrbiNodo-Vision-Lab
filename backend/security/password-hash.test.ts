import { describe, expect, it } from 'vitest';
import { hashPassword } from './password-hash';

describe('hash de contraseñas del servidor', () => {
  it('usa Argon2id, parámetros explícitos y un salt distinto', () => {
    const first = hashPassword('contraseña-ficticia-segura-1');
    const second = hashPassword('contraseña-ficticia-segura-1');

    expect(first).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
    expect(second).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
    expect(first).not.toBe(second);
    expect(first).not.toContain('contraseña-ficticia-segura-1');
  });
});
