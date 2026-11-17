/**
 * Puerto de auditoría (REQ-AUD-001, INV-AUD-001): solo dos operaciones. Ambas reciben el `RepositorySet` de la
 * transacción en curso para que la fila de auditoría y la mutación confirmen o se reviertan juntas (ADR-002-05).
 * Sin lectura, sin actualización, sin borrado: la purga de retención es de mantenimiento y no pasa por este puerto.
 *
 * @implements REQ-AUD-001, INV-AUD-001, INV-ARCH-005
 */

import type { AuditEntry } from '../../generated/schemas/types.ts';
import type { RepositorySet } from './repositories.port.ts';

export interface AuditLogPort {
  /** Inserta una fila de auditoría en la transacción de la mutación. */
  append(repositories: RepositorySet, entry: AuditEntry): Promise<void>;
  /**
   * Sustituye el `userId` en claro por su seudónimo HMAC en el historial del usuario (`executor_user_id` y `entity_id`).
   * El seudónimo se calcula antes con `AuditPseudonymPort.hmacUserId`.
   */
  pseudonymizeUser(repositories: RepositorySet, userId: string, hmac: string): Promise<void>;
}
