/**
 * Reconocimiento de una violación de restricción única por su nombre exacto, compartido por los mapeos de dominio
 * (microchip-violation.ts, username-violation.ts) para no duplicar la lógica de clasificación del driver.
 * - Postgres: `code = 23505` Y `constraint` igual al nombre exacto.
 * - SQLite: `code = SQLITE_CONSTRAINT_UNIQUE` Y mensaje exacto.
 * Cualquier otra violación (CHECK, NOT NULL, otro índice, clave primaria) NO coincide y quien llama la relanza tal cual.
 *
 * @implements REQ-PET4-001, INV-PET4-001, INV-LOG-001
 */
export interface UniqueConstraintName {
  readonly pgConstraint: string;
  readonly sqliteMessage: string;
}

export function isUniqueViolationOf(error: unknown, name: UniqueConstraintName): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, constraint, message } = error as { code?: unknown; constraint?: unknown; message?: unknown };
  if (code === '23505') return constraint === name.pgConstraint;
  if (code === 'SQLITE_CONSTRAINT_UNIQUE') return message === name.sqliteMessage;
  return false;
}
