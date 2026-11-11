/**
 * Token de confirmación de respaldo con SHA-256 (REQ-ACC-002 (5)). En disco queda solo el hash; el consumo es el UPDATE
 * condicional del repositorio (usedAt nulo, mismo usuario, expiresAt > ahora). El valor en claro lo genera
 * `SecureTokenPort.nextConfirmationToken()` y se entrega una sola vez.
 *
 * @implements REQ-ACC-002, REQ-BACKUP2-001, INV-AUTH-003, INV-ARCH-002, INV-ARCH-004
 */

import { createHash } from 'node:crypto';
import type { BackupTokenPort, IssuedConfirmationToken } from '../../application/ports/backup-token.port.ts';
import type { RepositorySet } from '../../application/ports/repositories.port.ts';
import type { SecureTokenPort } from '../../application/ports/secure-token.port.ts';
import { CONFIRMATION_TOKEN_TTL_MINUTES, isConfirmationTokenShape } from '../../domain/account/account-deletion-guards.ts';
import { addMillis } from '../../domain/auth/utc-timestamp.ts';

/** SHA-256 hexadecimal de un token (INV-AUTH-003). */
export const confirmationTokenHash = (token: string): string => createHash('sha256').update(token, 'utf8').digest('hex');

/** @implements REQ-ACC-002, REQ-BACKUP2-001 */
export class Sha256BackupTokenAdapter implements BackupTokenPort {
  constructor(private readonly tokens: SecureTokenPort) {}

  async issue(repositories: RepositorySet, userId: string, nowIsoTimestamp: string): Promise<IssuedConfirmationToken> {
    const token = this.tokens.nextConfirmationToken();
    const expiresAt = addMillis(nowIsoTimestamp, CONFIRMATION_TOKEN_TTL_MINUTES * 60_000);
    await repositories.confirmationTokens.replaceForUser(userId, confirmationTokenHash(token), nowIsoTimestamp, expiresAt);
    return { token, expiresAt };
  }

  async consume(repositories: RepositorySet, userId: string, token: string, nowIsoTimestamp: string): Promise<boolean> {
    if (!isConfirmationTokenShape(token)) return false;
    return repositories.confirmationTokens.consume(userId, confirmationTokenHash(token), nowIsoTimestamp);
  }
}
