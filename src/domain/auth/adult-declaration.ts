/**
 * Declaración de mayoría de edad (18+) del registro (Feature 010, Bloque D, T1424; D10-05, H-03 opción A, H-ARCH-ADULT-VERSION).
 * - `ADULT_NOTICE_VERSION` es la ÚNICA fuente de la versión del texto aceptado: la fija el servidor y el cliente nunca la envía. Vale `0.1.0` mientras `legal-texts.md` esté
 *   `DRAFT`; pasa a `1.0.0` solo cuando Neo (Nivel 2) apruebe la publicación, y cambia por decisión de `/architect` junto con la enmienda de los textos 18+.
 * - La declaración se valida ANTES de consultar la existencia del usuario o del correo (INV-MEN10-001) y, en Google, ANTES de consumir el estado OAuth (EDGE-010-010).
 * - No se pide fecha de nacimiento ni documento (REQ-MEN10-003).
 *
 * @implements REQ-MEN10-001, REQ-MEN10-002, REQ-MEN10-003, INV-MEN10-001, EDGE-010-005, EDGE-010-010, SC-010-022, SC-010-023, SC-010-024
 */

import { DomainError, validateAdultDeclaration } from '../../generated/v36/index.ts';

/** Versión SemVer del texto legal 18+ aceptado (patrón `AdultNoticeVersion` del contrato 010). */
export const ADULT_NOTICE_VERSION = '0.1.0';

const isPlainObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Exige `adultDeclaration === true` en el cuerpo y devuelve el cuerpo SIN ese campo (el resto lo valida el esquema vigente de 004). Un cuerpo que no es un objeto no se
 * toca: lo rechaza el esquema siguiente con su error de siempre. Ausente, `false`, `null`, cadenas y números dan el MISMO 422 (sin revelar nada del usuario).
 * @implements REQ-MEN10-001, INV-MEN10-001, ERR-MEN10-ADULT-DECLARATION-REQUIRED
 */
export function requireAdultDeclaration(input: unknown): unknown {
  if (!isPlainObject(input)) return input;
  const { adultDeclaration, ...rest } = input;
  if (!validateAdultDeclaration(adultDeclaration)) throw new DomainError('ERR-MEN10-ADULT-DECLARATION-REQUIRED', undefined, 'adultDeclaration');
  return rest;
}
