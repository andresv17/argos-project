import type { PasswordHasherPort } from '../../src/application/ports/password-hasher.port.ts';
import type { SecureTokenPort } from '../../src/application/ports/secure-token.port.ts';

/** Prefijo de los hashes falsos; el scrypt real se prueba en integración y seguridad (plan §3). */
export const FAKE_HASH_PREFIX = 'fake-scrypt$';
export const DUMMY_PASSWORD_HASH = `${FAKE_HASH_PREFIX}__argos_dummy_hash__`;

export interface HasherCall {
  readonly method: 'hash' | 'verify';
  readonly plain: string;
  readonly hash: string | null;
}

/** Hasher falso con espía: registra cada invocación (INV-AUTH-006, verificación sin umbral temporal, D-02). */
export class SpyPasswordHasher implements PasswordHasherPort {
  readonly calls: HasherCall[] = [];

  async hash(plain: string): Promise<string> {
    this.calls.push({ method: 'hash', plain, hash: null });
    return `${FAKE_HASH_PREFIX}${plain}`;
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    this.calls.push({ method: 'verify', plain, hash });
    return hash === `${FAKE_HASH_PREFIX}${plain}`;
  }

  reset(): void {
    this.calls.length = 0;
  }
}

/** Tokens de sesión deterministas: token-0001, token-0002… */
export class SequentialTokenAdapter implements SecureTokenPort {
  private counter = 0;

  nextSessionToken(): string {
    this.counter += 1;
    return `token-${String(this.counter).padStart(4, '0')}`;
  }
}
