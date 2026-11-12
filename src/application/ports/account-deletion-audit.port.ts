/**
 * Puerto TRANSITORIO de la eliminación de cuenta (rebanada 1). Conserva la forma previa de `AuditLogPort`
 * (`pseudonymOf` + `recordAccountDeletion`) que consume `DeleteAccountUseCase`. T265 integra `AuditLogPort` y
 * `AuditPseudonymPort` en ese caso de uso y elimina este puerto y `NullAuditLogAdapter`.
 *
 * @implements REQ-AUD-001, REQ-ACC-002, STATE-ACCOUNT-DELETE-001, INV-ARCH-004
 */

import type { RepositorySet } from './repositories.port.ts';

export interface AccountDeletionAuditPort {
  /** Seudónimo irreversible del userId. Cálculo puro, fase A3. */
  pseudonymOf(userId: string): string;
  /** Pasos B7 y B8 dentro de la transacción de eliminación. */
  recordAccountDeletion(repositories: RepositorySet, pseudonym: string, nowIsoTimestamp: string): Promise<void>;
}
