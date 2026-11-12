/**
 * Auditoría nula de la rebanada 1: no escribe filas ni seudonimiza. T265 la sustituye por el adaptador real (fila
 * ACCOUNT_DELETE con HMAC-SHA256 del userId, REQ-AUD-001). El seudónimo es una constante inocua de 64 hex.
 *
 * @implements REQ-AUD-001, REQ-ACC-002
 */

import type { AccountDeletionAuditPort } from '../../application/ports/account-deletion-audit.port.ts';
import type { RepositorySet } from '../../application/ports/repositories.port.ts';

export const NULL_PSEUDONYM = '0'.repeat(64);

export class NullAuditLogAdapter implements AccountDeletionAuditPort {
  pseudonymOf(_userId: string): string {
    return NULL_PSEUDONYM;
  }

  async recordAccountDeletion(_repositories: RepositorySet, _pseudonym: string, _nowIsoTimestamp: string): Promise<void> {
    // sin escrituras hasta T265
  }
}
