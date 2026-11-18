/**
 * Clasificación de la violación del índice único `users_username_lower` (REQ-LOG-002, INV-LOG-001). El caso de uso comprueba el username antes
 * de insertar, pero dos altas concurrentes pueden pasar ambas la comprobación; entonces la base es la última defensa y la violación se traduce
 * a ERR-AUTH-USERNAME-TAKEN (409, campo `username`) en lugar de escapar como error 500. El error del driver nunca se copia al error de dominio.
 * - Postgres: `code = 23505` Y `constraint = users_username_lower`.
 * - SQLite: `SQLITE_CONSTRAINT_UNIQUE` y mensaje exacto del índice de expresión `UNIQUE constraint failed: index 'users_username_lower'`.
 *
 * @implements REQ-LOG-002, INV-LOG-001, EDGE-009, ERR-AUTH-USERNAME-TAKEN
 */
import { DomainError } from '../../generated/v31/index.ts';
import { isUniqueViolationOf, type UniqueConstraintName } from './unique-violation.ts';

const USERNAME_INDEX: UniqueConstraintName = {
  pgConstraint: 'users_username_lower',
  sqliteMessage: "UNIQUE constraint failed: index 'users_username_lower'",
};

export const isUsernameLowerViolation = (error: unknown): boolean => isUniqueViolationOf(error, USERNAME_INDEX);

/** Ejecuta el guardado y mapea SOLO la violación de `users_username_lower` a ERR-AUTH-USERNAME-TAKEN. */
export async function mapUsernameViolation<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isUsernameLowerViolation(error)) throw new DomainError('ERR-AUTH-USERNAME-TAKEN', undefined, 'username');
    throw error;
  }
}
