/**
 * Adaptador real de `AuditLogPort` (REQ-AUD-001, ADR-002-05). Escribe por el `RepositorySet` de la transacción en curso
 * (`repositories.auditLog`), de modo que la fila de auditoría y la mutación confirman o se revierten juntas tanto en
 * SQLite como en memoria. No tiene estado propio ni lee configuración.
 *
 * @implements REQ-AUD-001, INV-AUD-001, INV-ARCH-004, INV-ARCH-005
 */

import type { AuditLogPort } from '../../application/ports/audit-log.port.ts';
import type { RepositorySet } from '../../application/ports/repositories.port.ts';
import type { AuditEntry } from '../../generated/schemas/types.ts';

export class RepositoryAuditLogAdapter implements AuditLogPort {
  async append(repositories: RepositorySet, entry: AuditEntry): Promise<void> {
    await repositories.auditLog.insert(entry);
  }

  async pseudonymizeUser(repositories: RepositorySet, userId: string, hmac: string): Promise<void> {
    await repositories.auditLog.pseudonymizeUser(userId, hmac);
  }
}
