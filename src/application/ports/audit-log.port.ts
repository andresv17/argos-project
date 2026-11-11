/**
 * Puerto de auditoría (REQ-AUD-001). En la rebanada 1 el adaptador es nulo; la fila `ACCOUNT_DELETE`, el HMAC-SHA256
 * del `userId` y la seudonimización del historial entran con T265 (rebanada 4).
 *
 * @implements REQ-AUD-001, REQ-ACC-002, STATE-ACCOUNT-DELETE-001, INV-ARCH-004
 */

import type { RepositorySet } from './repositories.port.ts';

export interface AuditLogPort {
  /** Seudónimo irreversible del userId (HMAC-SHA256 con la clave del puerto). Cálculo puro, fase A3. */
  pseudonymOf(userId: string): string;
  /**
   * Pasos B7 y B8: inserta la fila ACCOUNT_DELETE con el seudónimo y seudonimiza el historial del usuario, dentro de
   * la transacción de eliminación.
   */
  recordAccountDeletion(repositories: RepositorySet, pseudonym: string, nowIsoTimestamp: string): Promise<void>;
}
