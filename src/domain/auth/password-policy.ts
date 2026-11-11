/**
 * Política de contraseña de la Feature 002 (constantes de dominio; no lee reloj ni entorno).
 * - INV-AUTH2-001: al registrar o cambiar, `10 <= longitud <= 128` medida en caracteres Unicode (puntos de código), sin
 *   recortar ni normalizar la cadena; al menos una mayúscula (categoría Unicode `Lu`), un número (dígito ASCII `0-9`)
 *   y un símbolo, uno de los 32 caracteres ASCII de `PASSWORD_SYMBOLS`; el espacio no cuenta como símbolo.
 * - El inicio de sesión no aplica la política (REQ-AUTH2-002): solo exige una contraseña no vacía de máximo 128.
 * - Error único: ERR-AUTH-WEAK-PASSWORD.
 *
 * @implements INV-AUTH2-001, ERR-AUTH-WEAK-PASSWORD, INV-ARCH-001, INV-ARCH-004
 */

import { DomainError } from '../../generated/index.ts';

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
/** Los 32 símbolos ASCII imprimibles que no son letra, dígito ni espacio. */
export const PASSWORD_SYMBOLS = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';

const UPPERCASE_LETTER = /\p{Lu}/u;
const ASCII_DIGIT = /[0-9]/;

/**
 * true si la contraseña cumple INV-AUTH2-001.
 * @implements INV-AUTH2-001, ERR-AUTH-WEAK-PASSWORD
 */
export function isPasswordCompliant(password: string): boolean {
  const characters = Array.from(password);
  return (
    characters.length >= PASSWORD_MIN_LENGTH &&
    characters.length <= PASSWORD_MAX_LENGTH &&
    UPPERCASE_LETTER.test(password) &&
    ASCII_DIGIT.test(password) &&
    characters.some((character) => PASSWORD_SYMBOLS.includes(character))
  );
}

/**
 * Lanza ERR-AUTH-WEAK-PASSWORD (422) con `field` si el valor no es una cadena que cumpla la política.
 * @implements INV-AUTH2-001, ERR-AUTH-WEAK-PASSWORD
 */
export function assertPasswordCompliant(password: unknown, field: string = 'password'): void {
  if (typeof password !== 'string' || !isPasswordCompliant(password)) {
    throw new DomainError('ERR-AUTH-WEAK-PASSWORD', undefined, field);
  }
}
