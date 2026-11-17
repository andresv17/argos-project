/**
 * Token efímero de confirmación de respaldo (REQ-ACC-002 (5), REQ-BACKUP2-001): 32 bytes base64url, de un solo uso,
 * ligado al usuario y con caducidad de 10 minutos. En disco solo se guarda su SHA-256; un token nuevo reemplaza al
 * anterior. La emisión desde la exportación llega con la rebanada 5; en la rebanada 1 se siembra por este puerto.
 *
 * @implements REQ-ACC-002, REQ-BACKUP2-001, INV-AUTH-003, INV-ARCH-005
 */

import type { RepositorySet } from './repositories.port.ts';

export interface IssuedConfirmationToken {
  /** Valor en claro: se entrega una sola vez y no se guarda. */
  readonly token: string;
  readonly expiresAt: string;
}

export interface BackupTokenPort {
  issue(repositories: RepositorySet, userId: string, nowIsoTimestamp: string): Promise<IssuedConfirmationToken>;
  /**
   * Consumo condicional: true solo si el token coincide, es del usuario, no se usó y no caducó (`expiresAt > ahora`).
   * Una cadena sin la forma de ConfirmationToken devuelve false sin consultar.
   */
  consume(repositories: RepositorySet, userId: string, token: string, nowIsoTimestamp: string): Promise<boolean>;
}
