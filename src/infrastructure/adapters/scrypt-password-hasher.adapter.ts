/**
 * Hashing de contraseñas con scrypt y salt aleatorio (INV-AUTH-003).
 * - Formato: `scrypt$<N>$<r>$<p>$<salt base64>$<hash base64>`; salt de 16 bytes y clave de 64 bytes.
 * - `verify` recalcula con los parámetros guardados en el hash y compara en tiempo constante; un hash con N/r/p por encima de
 *   DEFAULT_SCRYPT_PARAMETERS (anti-DoS) devuelve false (sin lanzar).
 * - ADR-008-14: un hash que NO parsea (incluida la contraseña centinela `!no-password!` de las cuentas nacidas con Google) ejecuta igualmente una verificación
 *   dummy con los parámetros del adaptador, del mismo coste que una real, y devuelve siempre false: ni el resultado ni el tiempo distinguen «cuenta sin
 *   contraseña» de «contraseña incorrecta» (anti-enumeración).
 * - `createDummyHash()` produce el hash ficticio de INV-AUTH-006, con el mismo coste que uno real.
 *
 * @implements INV-AUTH-003, INV-AUTH-006, INV-ARCH-002, INV-ARCH-004
 */

import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import type { PasswordHasherPort } from '../../application/ports/password-hasher.port.ts';

export interface ScryptParameters {
  readonly N: number;
  readonly r: number;
  readonly p: number;
}

export const DEFAULT_SCRYPT_PARAMETERS: ScryptParameters = { N: 16384, r: 8, p: 1 };
export const SCRYPT_SALT_BYTES = 16;
export const SCRYPT_KEY_BYTES = 64;
/** Sal fija de la verificación dummy: su resultado se descarta, solo importa el coste. */
const DUMMY_SALT = Buffer.alloc(SCRYPT_SALT_BYTES, 0x5a);
const HASH_FORMAT = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9+/]+={0,2})\$([A-Za-z0-9+/]+={0,2})$/;

function scrypt(plain: string, salt: Buffer, keyLength: number, parameters: ScryptParameters): Promise<Buffer> {
  const options: ScryptOptions = { ...parameters, maxmem: 256 * parameters.N * parameters.r };
  return new Promise((resolve, reject) => {
    scryptCallback(plain.normalize('NFC'), salt, keyLength, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

/** @implements INV-AUTH-003, INV-AUTH-006 */
export class ScryptPasswordHasherAdapter implements PasswordHasherPort {
  constructor(private readonly parameters: ScryptParameters = DEFAULT_SCRYPT_PARAMETERS) {}

  public async hash(plain: string): Promise<string> {
    const salt = randomBytes(SCRYPT_SALT_BYTES);
    const key = await scrypt(plain, salt, SCRYPT_KEY_BYTES, this.parameters);
    const { N, r, p } = this.parameters;
    return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
  }

  public async verify(plain: string, hash: string): Promise<boolean> {
    const match = HASH_FORMAT.exec(hash);
    if (match === null) {
      // ADR-008-14: formato imposible (p. ej. el centinela) => verificación dummy del mismo coste y respuesta fija.
      await this.dummyVerify(plain);
      return false;
    }
    const [, N, r, p, salt, expected] = match as unknown as [string, string, string, string, string, string];
    const stored: ScryptParameters = { N: Number(N), r: Number(r), p: Number(p) };
    // Tope anti-DoS: un hash hostil no puede exigir más coste que el que el propio sistema genera (DEFAULT_SCRYPT_PARAMETERS).
    if (stored.N > DEFAULT_SCRYPT_PARAMETERS.N || stored.r > DEFAULT_SCRYPT_PARAMETERS.r || stored.p > DEFAULT_SCRYPT_PARAMETERS.p) return false;
    const expectedKey = Buffer.from(expected, 'base64');
    if (expectedKey.length === 0) return false;
    try {
      const key = await scrypt(plain, Buffer.from(salt, 'base64'), expectedKey.length, stored);
      return timingSafeEqual(key, expectedKey);
    } catch {
      return false;
    }
  }

  private async dummyVerify(plain: string): Promise<void> {
    try {
      await scrypt(plain, DUMMY_SALT, SCRYPT_KEY_BYTES, this.parameters);
    } catch {
      // El resultado se descarta; un fallo del KDF tampoco cambia la respuesta.
    }
  }

  /** Hash ficticio de INV-AUTH-006: hash real de un secreto aleatorio que nadie conoce. */
  public createDummyHash(): Promise<string> {
    return this.hash(randomBytes(32).toString('base64url'));
  }
}
