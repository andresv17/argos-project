/**
 * Reglas puras del perfil de usuario (REQ-ACC-001, REQ-TIME-001).
 * La zona horaria del perfil solo formatea horas de pantalla: nunca entra en un cálculo de edad, alerta ni estado.
 *
 * @implements REQ-ACC-001, REQ-TIME-001, ERR-SCHEMA-VALIDATION-FAILED, INV-ARCH-004
 */

import { DomainError } from '../../generated/index.ts';

/** true si el nombre es una zona IANA que reconoce la plataforma (la forma sintáctica la valida el esquema). */
export function isIanaTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone.trim() !== '';
  } catch {
    return false;
  }
}

/** Lanza ERR-SCHEMA-VALIDATION-FAILED (campo `timezone`) si la zona no existe en la base IANA. @implements REQ-ACC-001 */
export function assertIanaTimeZone(timeZone: string): void {
  if (!isIanaTimeZone(timeZone)) {
    throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', `UpdateProfileInput: timezone no es una zona horaria IANA válida (${timeZone}).`, 'timezone');
  }
}
