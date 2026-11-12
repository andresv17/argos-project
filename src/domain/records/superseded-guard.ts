/**
 * Guarda de inmutabilidad clínica (REQ-REC2-003, SC-015): un registro SUPERSEDED no se edita con ningún rol.
 *
 * @implements REQ-REC2-003, SC-015, ERR-REC-SUPERSEDED-IMMUTABLE
 */

import { DomainError } from '../../generated/index.ts';

/** Lanza ERR-REC-SUPERSEDED-IMMUTABLE (409) si el estado de alerta del registro es SUPERSEDED. */
export function assertRecordNotSuperseded(status: string): void {
  if (status === 'SUPERSEDED') {
    throw new DomainError('ERR-REC-SUPERSEDED-IMMUTABLE', 'Un registro reemplazado es inmutable.');
  }
}
